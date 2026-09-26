// Lyceum Placements — Placement Management System
// Copyright © Bhanu Mendis - LGH IT
package ratelimit

import (
	"context"
	"sync"
	"testing"
	"time"
)

type clock struct{ t time.Time }

func (c *clock) now() time.Time      { return c.t }
func (c *clock) add(d time.Duration) { c.t = c.t.Add(d) }

func TestBurstThenRefill(t *testing.T) {
	c := &clock{t: time.Unix(0, 0)}
	l := New(6) // one token every 10 seconds, burst 6
	l.now = c.now
	for i := 0; i < 6; i++ {
		if ok, _ := l.Allow("ip"); !ok {
			t.Fatalf("request %d refused inside the burst", i)
		}
	}
	ok, wait := l.Allow("ip")
	if ok || wait <= 0 || wait > 10*time.Second {
		t.Fatalf("7th request: ok=%v wait=%v", ok, wait)
	}
	if ok, _ := l.Allow("other"); !ok {
		t.Fatal("keys must not share a bucket")
	}
	c.add(10 * time.Second)
	if ok, _ := l.Allow("ip"); !ok {
		t.Fatal("one token should have refilled")
	}
}

func TestSweepDropsFullBuckets(t *testing.T) {
	c := &clock{t: time.Unix(0, 0)}
	l := New(60)
	l.now = c.now
	l.Allow("a")
	l.Allow("b")
	c.add(500 * time.Millisecond)
	l.Sweep()
	if l.Len() != 2 {
		t.Fatalf("partly spent buckets were dropped: %d", l.Len())
	}
	c.add(2 * time.Second)
	l.Sweep()
	if l.Len() != 0 {
		t.Fatalf("refilled buckets kept: %d", l.Len())
	}
}

func TestDisabled(t *testing.T) {
	l := New(0)
	for i := 0; i < 1000; i++ {
		if ok, _ := l.Allow("x"); !ok {
			t.Fatal("a disabled limiter refused")
		}
	}
}

func TestConcurrentUseAndSweeperStops(t *testing.T) {
	l := New(1000)
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() { l.RunSweeper(ctx, time.Millisecond); close(done) }()
	var wg sync.WaitGroup
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			for j := 0; j < 200; j++ {
				l.Allow(string(rune('a' + i)))
			}
		}(i)
	}
	wg.Wait()
	cancel()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("sweeper did not stop with its context")
	}
}
