import "../../lib/ds-test/src/cheat.sol";
import "../../lib/ds-test/src/test.sol";

abstract contract TestHelpers is DSTest {
    Vm cheat = Vm(0x7109709ECfa91a80626fF3989D68f67F5b1DD12D);

    function constructSig(
        address bidder,
        uint256 _auctionID,
        uint256 _bidAmount,
        uint256 lastHighestBid,
        uint256 privKey
    )
        public
        returns (bytes memory sig)
    {
        bytes32 mHash = keccak256(
            abi.encodePacked(bidder, _auctionID, _bidAmount, lastHighestBid)
        );
        mHash =
            keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", mHash));
        //  emit log_bytes32(mHash);
        (uint8 v, bytes32 r, bytes32 s) = cheat.sign(privKey, mHash);
        sig = getSig(v, r, s);
    }

    function getSig(uint8 v, bytes32 r, bytes32 s)
        public
        pure
        returns (bytes memory sig)
    {
        sig = bytes.concat(r, s, bytes1(v));
    }

    function fromHex(string memory s) public pure returns (bytes memory) {
        bytes memory ss = bytes(s);
        require(ss.length % 2 == 0); // length must be even
        bytes memory r = new bytes(ss.length / 2);
        for (uint256 i = 0; i < ss.length / 2; ++i) {
            r[i] = bytes1(
                fromHexChar(uint8(ss[2 * i]))
                    * 16
                    + fromHexChar(uint8(ss[2 * i + 1]))
            );
        }
        return r;
    }

    function fromHexChar(uint8 c) public pure returns (uint8) {
        if (bytes1(c) >= bytes1("0") && bytes1(c) <= bytes1("9")) {
            return c - uint8(bytes1("0"));
        }
        if (bytes1(c) >= bytes1("a") && bytes1(c) <= bytes1("f")) {
            return 10 + c - uint8(bytes1("a"));
        }
        if (bytes1(c) >= bytes1("A") && bytes1(c) <= bytes1("F")) {
            return 10 + c - uint8(bytes1("A"));
        }
    }
}