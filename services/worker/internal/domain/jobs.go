package domain

import (
	"errors"
	"math/big"
	"strings"
	"time"
)

type JobState string

const (
	JobPending   JobState = "PENDING"
	JobRetry     JobState = "RETRY"
	JobBroadcast JobState = "BROADCAST"
	JobConfirmed JobState = "CONFIRMED"
	JobFailed    JobState = "FAILED"
)

type MintJob struct {
	ID            string
	CourseID      string
	ChainCourseID *big.Int
	BuyerAddress  string
	TokenURI      string
	State         JobState
	TxHash        string
	Attempts      int
	NextAttemptAt time.Time
	LeaseOwner    string
	LeaseExpires  time.Time
}

func (job MintJob) Validate() error {
	if strings.TrimSpace(job.ID) == "" {
		return errors.New("job id is required")
	}
	if strings.TrimSpace(job.CourseID) == "" {
		return errors.New("course id is required")
	}
	if job.ChainCourseID == nil || job.ChainCourseID.Sign() <= 0 {
		return errors.New("positive chain course id is required")
	}
	if !isHexAddress(job.BuyerAddress) {
		return errors.New("valid buyer address is required")
	}
	if strings.TrimSpace(job.TokenURI) == "" {
		return errors.New("token uri is required")
	}
	return nil
}

func isHexAddress(value string) bool {
	if len(value) != 42 || !strings.HasPrefix(value, "0x") {
		return false
	}
	for _, char := range value[2:] {
		if !((char >= '0' && char <= '9') || (char >= 'a' && char <= 'f') || (char >= 'A' && char <= 'F')) {
			return false
		}
	}
	return true
}
