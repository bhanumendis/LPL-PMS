package httpapi

import "testing"

func TestPasswordProblem(t *testing.T) {
	cases := map[string]string{
		"short1A!":       "Use at least 10 characters.",
		"alllowercase":   "Mix at least three of: lower case, upper case, digits, symbols.",
		"lowerUPPERonly": "Mix at least three of: lower case, upper case, digits, symbols.",
		"lower12345678":  "Mix at least three of: lower case, upper case, digits, symbols.",
		"Password123":    "",
		"password123!":   "",
		"PASSWORD-123":   "",
		"සිංහලPassword1": "",
		"1234567890!@#$": "Mix at least three of: lower case, upper case, digits, symbols.",
		"Abcdefghij!":    "",
		"Ab1Ab1Ab1A":     "",
	}
	for pw, want := range cases {
		if got := PasswordProblem(pw); got != want {
			t.Errorf("%q: got %q want %q", pw, got, want)
		}
	}
}
