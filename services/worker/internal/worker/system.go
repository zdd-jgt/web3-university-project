package worker

import (
	"log/slog"
	"time"
)

type SystemClock struct{}

func (SystemClock) Now() time.Time {
	return time.Now().UTC()
}

type SlogLogger struct {
	Logger *slog.Logger
}

func (logger SlogLogger) Info(message string, attributes ...any) {
	logger.Logger.Info(message, attributes...)
}

func (logger SlogLogger) Error(message string, attributes ...any) {
	logger.Logger.Error(message, attributes...)
}
