// Lyceum Placements — Placement Management System
// Copyright (c) 2026 Bhanu Mendis. All rights reserved.
// Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
//
// lpl-api serves the Placement Management System's backend contract in place of Supabase's
// request path: /rest/v1 (data), /auth/v1 (proxied to GoTrue) and
// /functions/v1/admin-users (account administration). One binary, one Postgres.
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

	hs := &http.Server{
		Addr:              cfg.ListenAddr,
		Handler:           srv.Handler(),
		ReadHeaderTimeout: 10 * time.Second,
		IdleTimeout:       120 * time.Second,
	}
	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		_ = hs.Shutdown(shutdownCtx)
	}()

	logger.Info("lpl-api listening", "addr", cfg.ListenAddr, "gotrue", cfg.GoTrueURL, "simple_protocol", cfg.DBSimpleProtocol)
	if err := hs.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		logger.Error("listen", "error", err.Error())
		os.Exit(1)
	}
	logger.Info("lpl-api stopped")
}
