 update-submodules: 
	@echo Update git submodules
	@git submodule update --init --recursive

 deploy-GBM:
	@echo Deploying GBM contracts to mumbai
	@forge script script/deployGBM.s.sol:GBMDeploy --rpc-url <> --private-key <> --with-gas-price 150000000000 --broadcast --verify --etherscan-api-key <> -vvvvv



	