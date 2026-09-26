// Lyceum Placements — Placement Management System
// Copyright © Bhanu Mendis - LGH IT
//
// Package ratelimit is a per-key token bucket held in memory. It bounds brute force against
// the sign-in endpoint and floods against the API on a single instance; the identity
// provider keeps its own limits behind it. Buckets that have refilled completely carry no
// information and are swept, so memory follows the number of recently active clients.
package ratelimit

import (
	"context"
	"math"
	"sync"
	"time"
)

type bucket struct {
	tokens float64
	last   time.Time
}

// Limiter allows `perMinute` events per key per minute with a burst of the same size.
type Limiter struct {
	mu       sync.Mutex
	perSec   float64
	burst    float64
	buckets  map[string]*bucket
	now      func() time.Time
	disabled bool
}

// New returns a limiter. perMinute <= 0 disables it (Allow always succeeds).
func New(perMinute int) *Limiter {
	l := &Limiter{buckets: map[string]*bucket{}, now: time.Now}
	if perMinute <= 0 {
		l.disabled = true
		return l
	}
	l.perSec = float64(perMinute) / 60
	l.burst = float64(perMinute)
	return l
}

// Allow spends one token for key. When none is left it reports how long until one is.
func (l *Limiter) Allow(key string) (bool, time.Duration) {
	if l.disabled {
		return true, 0
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	now := l.now()
	b, ok := l.buckets[key]
	if !ok {
		b = &bucket{tokens: l.burst, last: now}
		l.buckets[key] = b
	}
	b.tokens = math.Min(l.burst, b.tokens+now.Sub(b.last).Seconds()*l.perSec)
	b.last = now
	if b.tokens >= 1 {
		b.tokens--
		return true, 0
	}
	wait := time.Duration((1 - b.tokens) / l.perSec * float64(time.Second))
	return false, wait
}

// Sweep drops buckets that have refilled completely.
func (l *Limiter) Sweep() {
	if l.disabled {
		return
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	now := l.now()
	for k, b := range l.buckets {
		if b.tokens+now.Sub(b.last).Seconds()*l.perSec >= l.burst {
			delete(l.buckets, k)
		}
	}
}

// Len is the number of buckets held (tests and metrics).
func (l *Limiter) Len() int {
	l.mu.Lock()
	defer l.mu.Unlock()
	return len(l.buckets)
}

// RunSweeper sweeps every interval until ctx is done; run it in its own goroutine.
func (l *Limiter) RunSweeper(ctx context.Context, interval time.Duration) {
	t := time.NewTicker(interval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			l.Sweep()
		}
	}
}
