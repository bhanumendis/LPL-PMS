// Lyceum Placements — Placement Management System
// Copyright © Bhanu Mendis - LGH IT
package httpapi

import (
	"fmt"
	"unicode/utf8"
)

// MinPasswordLength matches MIN_PASSWORD_LENGTH in src/lib/defaults.ts.
const MinPasswordLength = 10

// PasswordProblem applies the rule the browser and the Edge Function share: length, and at
// least three of the four character classes. The messages are the ones the frontend shows.
// Length is counted in code points, which equals JavaScript's .length for every character
// outside the astral planes.
func PasswordProblem(pw string) string {
	if utf8.RuneCountInString(pw) < MinPasswordLength {
		return fmt.Sprintf("Use at least %d characters.", MinPasswordLength)
	}
	var lower, upper, digit, symbol bool
	for _, r := range pw {
		switch {
		case r >= 'a' && r <= 'z':
			lower = true
		case r >= 'A' && r <= 'Z':
			upper = true
		case r >= '0' && r <= '9':
			digit = true
		default:
			// JavaScript's [^A-Za-z0-9] counts anything else, letters of other scripts included.
			symbol = true
		}
	}
	classes := 0
	for _, b := range []bool{lower, upper, digit, symbol} {
		if b {
			classes++
		}
	}
	if classes < 3 {
		return "Mix at least three of: lower case, upper case, digits, symbols."
	}
	return ""
}
