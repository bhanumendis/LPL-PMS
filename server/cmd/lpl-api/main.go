// Lyceum Placements — Placement Management System
// Copyright (c) 2026 Bhanu Mendis. All rights reserved.
// Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
//
// lpl-api serves the Placement Management System's backend contract in place of Supabase's
// request path: /rest/v1 (data), /auth/v1 (proxied to GoTrue) and
// /functions/v1/admin-users (account administration). It also runs the background work
// (internal/workers): Web Push delivery, service-level reminders, the shared dashboard and
// notification retention. One binary, one Postgres.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"lpl-api/internal/auth"
	"lpl-api/internal/config"
	"lpl-api/internal/db"
	"lpl-api/internal/gotrue"
	"lpl-api/internal/httpapi"
	"lpl-api/internal/webpush"
	"lpl-api/internal/workers"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	cfg, err := config.Load()
	if err != nil {
		logger.Error("configuration", "error", err.Error())
		os.Exit(2)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	pool, err := db.Open(ctx, cfg.DatabaseURL, cfg.DBMaxConns, cfg.DBSimpleProtocol, cfg.DBSystemRole)
	if err != nil {
		logger.Error("database", "error", err.Error())
		os.Exit(1)
	}
	defer pool.Close()

	srv, err := httpapi.New(httpapi.Deps{
		Config:   cfg,
		Runner:   pool,
		Resolver: auth.NewVerifier(cfg.AnonKey, cfg.JWTSecret, cfg.JWKSURL, cfg.JWTLeeway),
		GoTrue:   gotrue.NewClient(cfg.GoTrueURL, cfg.ServiceRoleKey),
		Logger:   logger,
	})
	if err != nil {
		logger.Error("server", "error", err.Error())
		os.Exit(1)
	}

	go srv.RunBackground(ctx)

	workersDone := make(chan struct{})
	if cfg.Workers {
		var sender *webpush.Sender
		if cfg.VAPIDPublicKey != "" {
			v, err := webpush.ParseVAPID(cfg.VAPIDPublicKey, cfg.VAPIDPrivateKey, cfg.VAPIDSubject)
			if err != nil { // config.Load has checked it; this cannot fail
				logger.Error("vapid", "error", err.Error())
				os.Exit(2)
			}
			sender = webpush.NewSender(v, cfg.PushHosts)
		}
		w := workers.New(pool, sender, logger, workers.Config{
			PushInterval: cfg.PushInterval, SLAInterval: cfg.SLAInterval, DashboardInterval: cfg.DashboardInterval,
			PruneInterval: cfg.PruneInterval, RetentionDays: cfg.NotificationRetentionDays,
		})
		go func() { w.Run(ctx); close(workersDone) }()
	} else {
		close(workersDone)
	}

	hs := &http.Server{
		Addr:              cfg.ListenAddr,
		Handler:           srv.Handler(),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       cfg.RequestTimeout + 10*time.Second,
		WriteTimeout:      cfg.RequestTimeout + 10*time.Second,
		IdleTimeout:       120 * time.Second,
		MaxHeaderBytes:    64 << 10,
		ErrorLog:          slog.NewLogLogger(logger.Handler(), slog.LevelWarn),
	}
	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		_ = hs.Shutdown(shutdownCtx)
	}()

	logger.Info("lpl-api listening", "addr", cfg.ListenAddr, "env", cfg.Env, "gotrue", cfg.GoTrueURL, "simple_protocol", cfg.DBSimpleProtocol,
		"cors_origins", cfg.CORSAllowOrigins, "workers", cfg.Workers, "push", cfg.Workers && cfg.VAPIDPublicKey != "")
	if err := hs.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		logger.Error("listen", "error", err.Error())
		os.Exit(1)
	}
	// Let the workers finish the tick they are in (a push batch records its outcomes) before
	// the pool closes under them.
	select {
	case <-workersDone:
	case <-time.After(30 * time.Second):
		logger.Warn("workers did not stop within 30s")
	}
	logger.Info("lpl-api stopped")
}
