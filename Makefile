
-include .env

export FOUNDRY_ETH_RPC_URL=${MATIC_URL}
export FOUNDRY_FORK_BLOCK_NUMBER?=36409009


 test-GBMRoyalties:
	@echo testing GBM Royalties
	@ forge t --mc RoyaltyTests -vvvvv  


