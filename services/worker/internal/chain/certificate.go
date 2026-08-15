package chain

import (
	"context"
	"crypto/ecdsa"
	"errors"
	"fmt"
	"math/big"
	"strings"

	"github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/accounts/abi/bind"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/ethereum/go-ethereum/ethclient"
	"github.com/yideng/web3-university-worker/internal/worker"
)

const certificateABI = `[
  {"type":"function","name":"certificateOf","stateMutability":"view","inputs":[{"name":"student","type":"address"},{"name":"courseId","type":"uint256"}],"outputs":[{"name":"tokenId","type":"uint256"}]},
  {"type":"function","name":"mintCertificate","stateMutability":"nonpayable","inputs":[{"name":"student","type":"address"},{"name":"courseId","type":"uint256"},{"name":"metadataURI","type":"string"}],"outputs":[{"name":"tokenId","type":"uint256"}]}
]`

// CertificateClient owns the only privileged chain write used by the worker.
// The key is kept in memory only and every transaction is bound to chainID.
type CertificateClient struct {
	client   *ethclient.Client
	contract *bind.BoundContract
	signer   *bind.TransactOpts
}

func NewCertificateClient(
	ctx context.Context,
	rpcURL string,
	contractAddress string,
	privateKey string,
	chainID *big.Int,
) (*CertificateClient, error) {
	if strings.TrimSpace(rpcURL) == "" {
		return nil, errors.New("rpc URL is required")
	}
	if !common.IsHexAddress(contractAddress) || common.HexToAddress(contractAddress) == (common.Address{}) {
		return nil, errors.New("valid certificate contract address is required")
	}
	if chainID == nil || chainID.Sign() <= 0 {
		return nil, errors.New("positive chain ID is required")
	}

	key, err := parsePrivateKey(privateKey)
	if err != nil {
		return nil, err
	}
	client, err := ethclient.DialContext(ctx, rpcURL)
	if err != nil {
		return nil, fmt.Errorf("dial chain RPC: %w", err)
	}
	actualChainID, err := client.ChainID(ctx)
	if err != nil {
		client.Close()
		return nil, fmt.Errorf("read RPC chain ID: %w", err)
	}
	if actualChainID.Cmp(chainID) != 0 {
		client.Close()
		return nil, fmt.Errorf("RPC chain ID %s does not match configured chain ID %s", actualChainID, chainID)
	}

	parsedABI, err := abi.JSON(strings.NewReader(certificateABI))
	if err != nil {
		client.Close()
		return nil, fmt.Errorf("parse certificate ABI: %w", err)
	}
	signer, err := bind.NewKeyedTransactorWithChainID(key, chainID)
	if err != nil {
		client.Close()
		return nil, fmt.Errorf("create chain-bound signer: %w", err)
	}
	address := common.HexToAddress(contractAddress)
	return &CertificateClient{
		client:   client,
		contract: bind.NewBoundContract(address, parsedABI, client, client, client),
		signer:   signer,
	}, nil
}

func (client *CertificateClient) Close() {
	client.client.Close()
}

func (client *CertificateClient) RawClient() *ethclient.Client {
	return client.client
}

func (client *CertificateClient) CertificateOf(
	ctx context.Context,
	buyer string,
	courseID *big.Int,
	confirmations uint64,
) (*big.Int, error) {
	if !common.IsHexAddress(buyer) || common.HexToAddress(buyer) == (common.Address{}) {
		return nil, errors.New("valid buyer address is required")
	}
	if courseID == nil || courseID.Sign() <= 0 {
		return nil, errors.New("positive course ID is required")
	}
	if confirmations == 0 {
		return nil, errors.New("confirmations must be positive")
	}
	latest, err := client.client.HeaderByNumber(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("read latest block for certificateOf: %w", err)
	}
	confirmedBlock := new(big.Int).Sub(latest.Number, new(big.Int).SetUint64(confirmations-1))
	if confirmedBlock.Sign() < 0 {
		return new(big.Int), nil
	}
	var output []any
	if err := client.contract.Call(
		&bind.CallOpts{Context: ctx, BlockNumber: confirmedBlock},
		&output,
		"certificateOf",
		common.HexToAddress(buyer),
		courseID,
	); err != nil {
		return nil, fmt.Errorf("call certificateOf: %w", err)
	}
	if len(output) != 1 {
		return nil, fmt.Errorf("certificateOf returned %d values", len(output))
	}
	tokenID, ok := output[0].(*big.Int)
	if !ok || tokenID == nil {
		return nil, fmt.Errorf("certificateOf returned unexpected type %T", output[0])
	}
	return new(big.Int).Set(tokenID), nil
}

func (client *CertificateClient) MintCertificate(
	ctx context.Context,
	buyer string,
	courseID *big.Int,
	tokenURI string,
) (string, error) {
	if !common.IsHexAddress(buyer) || common.HexToAddress(buyer) == (common.Address{}) {
		return "", errors.New("valid buyer address is required")
	}
	if courseID == nil || courseID.Sign() <= 0 {
		return "", errors.New("positive course ID is required")
	}
	if strings.TrimSpace(tokenURI) == "" {
		return "", errors.New("token URI is required")
	}

	transactionOptions := *client.signer
	transactionOptions.Context = ctx
	transaction, err := client.contract.Transact(
		&transactionOptions,
		"mintCertificate",
		common.HexToAddress(buyer),
		courseID,
		tokenURI,
	)
	if err != nil {
		return "", fmt.Errorf("send mintCertificate: %w", err)
	}
	return transaction.Hash().Hex(), nil
}

func (client *CertificateClient) Receipt(
	ctx context.Context,
	txHash string,
	confirmations uint64,
) (worker.Receipt, error) {
	if !common.IsHexHash(txHash) {
		return worker.Receipt{}, errors.New("valid transaction hash is required")
	}
	if confirmations == 0 {
		return worker.Receipt{}, errors.New("confirmations must be positive")
	}
	receipt, err := client.client.TransactionReceipt(ctx, common.HexToHash(txHash))
	if errors.Is(err, ethereum.NotFound) {
		return worker.Receipt{Found: false}, nil
	}
	if err != nil {
		return worker.Receipt{}, fmt.Errorf("read transaction receipt: %w", err)
	}
	latest, err := client.client.HeaderByNumber(ctx, nil)
	if err != nil {
		return worker.Receipt{}, fmt.Errorf("read latest block: %w", err)
	}
	confirmedAt := new(big.Int).Add(receipt.BlockNumber, new(big.Int).SetUint64(confirmations-1))
	confirmed := latest.Number.Cmp(confirmedAt) >= 0
	return worker.Receipt{
		Found:       true,
		Confirmed:   confirmed,
		Succeeded:   receipt.Status == types.ReceiptStatusSuccessful,
		BlockNumber: receipt.BlockNumber.Uint64(),
	}, nil
}

func parsePrivateKey(value string) (*ecdsa.PrivateKey, error) {
	trimmed := strings.TrimPrefix(strings.TrimSpace(value), "0x")
	if trimmed == "" {
		return nil, errors.New("worker private key is required")
	}
	key, err := crypto.HexToECDSA(trimmed)
	if err != nil {
		return nil, fmt.Errorf("parse worker private key: %w", err)
	}
	return key, nil
}
