package config

import (
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Environment          string
	DatabaseURL          string
	ChainRPCURL          string
	ChainID              int64
	CertificateAddress   string
	CourseCatalogAddress string
	CourseMarketAddress  string
	WorkerPrivateKey     string
	Confirmations        uint64
	PollInterval         time.Duration
	LeaseDuration        time.Duration
	MaxAttempts          int
	WorkerID             string
	IndexerStartBlock    uint64
	IndexerReorgDepth    uint64
}

func Load() (Config, error) {
	chainID, err := int64Value("CHAIN_ID", 0)
	if err != nil {
		return Config{}, err
	}
	confirmations, err := uint64Value("WORKER_CONFIRMATIONS", 2)
	if err != nil {
		return Config{}, err
	}
	maxAttempts, err := intValue("WORKER_MAX_ATTEMPTS", 5)
	if err != nil {
		return Config{}, err
	}
	pollInterval, err := durationValue("WORKER_POLL_INTERVAL", 2*time.Second)
	if err != nil {
		return Config{}, err
	}
	leaseDuration, err := durationValue("WORKER_LEASE_DURATION", 30*time.Second)
	if err != nil {
		return Config{}, err
	}

	startBlock, err := uint64Value("INDEXER_START_BLOCK", 0)
	if err != nil {
		return Config{}, err
	}
	reorgDepth, err := uint64Value("INDEXER_REORG_DEPTH", 12)
	if err != nil {
		return Config{}, err
	}
	workerID, err := workerIDValue()
	if err != nil {
		return Config{}, err
	}

	config := Config{
		Environment:          value("APP_ENV", "local"),
		DatabaseURL:          strings.TrimSpace(os.Getenv("DATABASE_URL")),
		ChainRPCURL:          strings.TrimSpace(os.Getenv("CHAIN_RPC_URL")),
		ChainID:              chainID,
		CertificateAddress:   strings.TrimSpace(os.Getenv("CERTIFICATE_SBT_ADDRESS")),
		CourseCatalogAddress: strings.TrimSpace(os.Getenv("COURSE_CATALOG_ADDRESS")),
		CourseMarketAddress:  strings.TrimSpace(os.Getenv("COURSE_MARKET_ADDRESS")),
		WorkerPrivateKey:     strings.TrimSpace(os.Getenv("WORKER_PRIVATE_KEY")),
		Confirmations:        confirmations,
		PollInterval:         pollInterval,
		LeaseDuration:        leaseDuration,
		MaxAttempts:          maxAttempts,
		WorkerID:             workerID,
		IndexerStartBlock:    startBlock,
		IndexerReorgDepth:    reorgDepth,
	}

	if err := config.Validate(); err != nil {
		return Config{}, err
	}
	return config, nil
}

func (config Config) Validate() error {
	missing := make([]string, 0)
	for name, current := range map[string]string{
		"DATABASE_URL":            config.DatabaseURL,
		"CHAIN_RPC_URL":           config.ChainRPCURL,
		"CERTIFICATE_SBT_ADDRESS": config.CertificateAddress,
		"COURSE_CATALOG_ADDRESS":  config.CourseCatalogAddress,
		"COURSE_MARKET_ADDRESS":   config.CourseMarketAddress,
		"WORKER_PRIVATE_KEY":      config.WorkerPrivateKey,
	} {
		if current == "" {
			missing = append(missing, name)
		}
	}
	if len(missing) > 0 {
		return fmt.Errorf("missing required configuration: %s", strings.Join(missing, ", "))
	}
	if config.ChainID <= 0 {
		return errors.New("CHAIN_ID must be positive")
	}
	if config.Confirmations == 0 {
		return errors.New("WORKER_CONFIRMATIONS must be positive")
	}
	if config.MaxAttempts < 1 || config.MaxAttempts > 20 {
		return errors.New("WORKER_MAX_ATTEMPTS must be between 1 and 20")
	}
	if config.PollInterval < 100*time.Millisecond {
		return errors.New("WORKER_POLL_INTERVAL must be at least 100ms")
	}
	if config.LeaseDuration <= config.PollInterval {
		return errors.New("WORKER_LEASE_DURATION must exceed WORKER_POLL_INTERVAL")
	}
	if config.IndexerReorgDepth == 0 || config.IndexerReorgDepth > 1_000 {
		return errors.New("INDEXER_REORG_DEPTH must be between 1 and 1000")
	}
	return nil
}

func workerIDValue() (string, error) {
	if explicit := strings.TrimSpace(os.Getenv("WORKER_ID")); explicit != "" {
		return explicit, nil
	}
	hostname, err := os.Hostname()
	if err != nil {
		return "", fmt.Errorf("read hostname for WORKER_ID: %w", err)
	}
	return fmt.Sprintf("certificate-worker-%s-%d", hostname, os.Getpid()), nil
}

func value(name string, fallback string) string {
	if current := strings.TrimSpace(os.Getenv(name)); current != "" {
		return current
	}
	return fallback
}

func durationValue(name string, fallback time.Duration) (time.Duration, error) {
	current := strings.TrimSpace(os.Getenv(name))
	if current == "" {
		return fallback, nil
	}
	parsed, err := time.ParseDuration(current)
	if err != nil {
		return 0, fmt.Errorf("parse %s: %w", name, err)
	}
	return parsed, nil
}

func intValue(name string, fallback int) (int, error) {
	current := strings.TrimSpace(os.Getenv(name))
	if current == "" {
		return fallback, nil
	}
	parsed, err := strconv.Atoi(current)
	if err != nil {
		return 0, fmt.Errorf("parse %s: %w", name, err)
	}
	return parsed, nil
}

func int64Value(name string, fallback int64) (int64, error) {
	current := strings.TrimSpace(os.Getenv(name))
	if current == "" {
		return fallback, nil
	}
	parsed, err := strconv.ParseInt(current, 10, 64)
	if err != nil {
		return 0, fmt.Errorf("parse %s: %w", name, err)
	}
	return parsed, nil
}

func uint64Value(name string, fallback uint64) (uint64, error) {
	current := strings.TrimSpace(os.Getenv(name))
	if current == "" {
		return fallback, nil
	}
	parsed, err := strconv.ParseUint(current, 10, 64)
	if err != nil {
		return 0, fmt.Errorf("parse %s: %w", name, err)
	}
	return parsed, nil
}
