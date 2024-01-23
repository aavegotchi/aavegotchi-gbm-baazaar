// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

library LibAddress {
    function isContract(address _account) internal view returns (bool) {
        if (_account == address(0)) {
            return false;
        }

        uint256 size;
        assembly {
            size := extcodesize(_account)
        }
        return size > 0;
    }

    function functionExists(address _contract, string memory _func) internal view returns (bool) {
        bytes4 selector = bytes4(keccak256(bytes(_func)));
        bytes memory bytecode = _contract.code;

        // Check if the bytecode contains the function selector
        for (uint i = 0; i < bytecode.length - 3; i++) {
            if (bytecode[i] == selector[0] && bytecode[i + 1] == selector[1] && bytecode[i + 2] == selector[2] && bytecode[i + 3] == selector[3]) {
                return true;
            }
        }
        return false;
    }
}
