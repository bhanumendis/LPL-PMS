// Lyceum Placements — Placement Management System
// Copyright (c) 2026 Bhanu Mendis. All rights reserved.
// Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
//
// lpl-dbtool — small database helper so that neither psql nor the Supabase CLI is needed:
//
//	lpl-dbtool apply -f ../supabase/schema.sql        run a SQL file against $DATABASE_URL
//	lpl-dbtool ping                                    check the connection
//	lpl-dbtool mint -secret S -role authenticated -sub <uuid>   print an HS256 JWT (local stacks, tests)
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"os"
	"time"

	"github.com/jackc/pgx/v5"

	"lpl-api/internal/auth"
)

func main() {
	if len(os.Args) < 2 {
		usage()
		os.Exit(2)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()
	var err error
	switch os.Args[1] {
	case "apply":
		err = apply(ctx, os.Args[2:])
	case "ping":
		err = ping(ctx, os.Args[2:])
	case "mint":
		err = mint(os.Args[2:])
	case "help", "-h", "--help":
		usage()
		return
	default:
		usage()
		os.Exit(2)
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
}

func usage() {
	fmt.Fprint(os.Stderr, `lpl-dbtool — database helper for lpl-api

  apply -f <file.sql> [-dsn <url>]   run a SQL file (multi-statement) against the database
  ping [-dsn <url>]                  check the connection
  mint -secret <s> [-role <r>] [-sub <uuid>] [-exp <duration>] [-aud <a>]
                                     print an HS256 JWT for a local GoTrue-less stack or a test

-dsn defaults to $DATABASE_URL.
`)
}

func connect(ctx context.Context, dsn string) (*pgx.Conn, error) {
	if dsn == "" {
		dsn = os.Getenv("DATABASE_URL")
	}
	if dsn == "" {
		return nil, errors.New("no -dsn given and DATABASE_URL is unset")
	}
	return pgx.Connect(ctx, dsn)
}

func apply(ctx context.Context, args []string) error {
	fs := flag.NewFlagSet("apply", flag.ExitOnError)
	file := fs.String("f", "", "SQL file to run")
	dsn := fs.String("dsn", "", "connection string")
	_ = fs.Parse(args)
	if *file == "" {
		return errors.New("-f is required")
	}
	sqlText, err := os.ReadFile(*file)
	if err != nil {
		return err
	}
	conn, err := connect(ctx, *dsn)
	if err != nil {
		return err
	}
	defer conn.Close(ctx)
	// The simple protocol sends the whole file as one multi-statement request, so
	// dollar-quoted function bodies and DO blocks run exactly as in the SQL editor.
	results, err := conn.PgConn().Exec(ctx, string(sqlText)).ReadAll()
	if err != nil {
		return err
	}
	for _, r := range results {
		if r.Err != nil {
			return r.Err
		}
	}
	fmt.Printf("applied %s (%d statements)\n", *file, len(results))
	return nil
}

func ping(ctx context.Context, args []string) error {
	fs := flag.NewFlagSet("ping", flag.ExitOnError)
	dsn := fs.String("dsn", "", "connection string")
	_ = fs.Parse(args)
	conn, err := connect(ctx, *dsn)
	if err != nil {
		return err
	}
	defer conn.Close(ctx)
	if err := conn.Ping(ctx); err != nil {
		return err
	}
	var version string
	if err := conn.QueryRow(ctx, "select version()").Scan(&version); err != nil {
		return err
	}
	fmt.Println("ok:", version)
	return nil
}

func mint(args []string) error {
	fs := flag.NewFlagSet("mint", flag.ExitOnError)
	secret := fs.String("secret", os.Getenv("JWT_SECRET"), "HS256 secret (default $JWT_SECRET)")
	role := fs.String("role", "authenticated", "role claim")
	sub := fs.String("sub", "", "subject (auth.users.id); omit for a key-style token")
	aud := fs.String("aud", "authenticated", "audience claim")
	exp := fs.Duration("exp", 24*time.Hour, "lifetime")
	_ = fs.Parse(args)
	if *secret == "" {
		return errors.New("-secret is required")
	}
	now := time.Now()
	claims := map[string]any{"role": *role, "iss": "lpl-dbtool", "iat": now.Unix(), "exp": now.Add(*exp).Unix()}
	if *aud != "" {
		claims["aud"] = *aud
	}
	if *sub != "" {
		claims["sub"] = *sub
	}
	tok, err := auth.SignHS256(claims, []byte(*secret))
	if err != nil {
		return err
	}
	fmt.Println(tok)
	return nil
}
