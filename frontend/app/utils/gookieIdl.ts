export const GOOKIE_IDL = {
  "address": "3VkzfA6GU6VhMdEnYRJywLLEQ454B9gmQoNh4ycVFFS5",
  "metadata": {
    "name": "gookie",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "admin_slash",
      "discriminator": [
        61,
        165,
        206,
        215,
        191,
        254,
        140,
        90
      ],
      "accounts": [
        {
          "name": "platform_config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  111,
                  111,
                  107,
                  105,
                  101,
                  95,
                  112,
                  108,
                  97,
                  116,
                  102,
                  111,
                  114,
                  109
                ]
              }
            ]
          }
        },
        {
          "name": "gookie_auction",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  111,
                  111,
                  107,
                  105,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "gookie_auction.auction_id",
                "account": "GookieAuction"
              }
            ]
          }
        },
        {
          "name": "escrow_token_account",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  111,
                  111,
                  107,
                  105,
                  101,
                  95,
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "gookie_auction"
              }
            ]
          }
        },
        {
          "name": "treasury_token_account",
          "writable": true
        },
        {
          "name": "treasury",
          "relations": [
            "platform_config"
          ]
        },
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "platform_config"
          ]
        },
        {
          "name": "token_program",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "reason",
          "type": "string"
        }
      ]
    },
    {
      "name": "close_auction",
      "discriminator": [
        225,
        129,
        91,
        48,
        215,
        73,
        203,
        172
      ],
      "accounts": [
        {
          "name": "platform_config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  111,
                  111,
                  107,
                  105,
                  101,
                  95,
                  112,
                  108,
                  97,
                  116,
                  102,
                  111,
                  114,
                  109
                ]
              }
            ]
          }
        },
        {
          "name": "gookie_auction",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  111,
                  111,
                  107,
                  105,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "gookie_auction.auction_id",
                "account": "GookieAuction"
              }
            ]
          }
        },
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "platform_config"
          ]
        }
      ],
      "args": []
    },
    {
      "name": "create_gookie_auction",
      "discriminator": [
        202,
        167,
        69,
        117,
        147,
        109,
        195,
        96
      ],
      "accounts": [
        {
          "name": "platform_config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  111,
                  111,
                  107,
                  105,
                  101,
                  95,
                  112,
                  108,
                  97,
                  116,
                  102,
                  111,
                  114,
                  109
                ]
              }
            ]
          }
        },
        {
          "name": "gookie_auction",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  111,
                  111,
                  107,
                  105,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "platform_config.auction_counter",
                "account": "PlatformConfig"
              }
            ]
          }
        },
        {
          "name": "escrow_token_account",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  111,
                  111,
                  107,
                  105,
                  101,
                  95,
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "gookie_auction"
              }
            ]
          }
        },
        {
          "name": "rfrm_mint"
        },
        {
          "name": "authority",
          "writable": true,
          "signer": true,
          "relations": [
            "platform_config"
          ]
        },
        {
          "name": "token_program",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "system_program",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "rent",
          "address": "SysvarRent111111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "title",
          "type": "string"
        },
        {
          "name": "description",
          "type": "string"
        },
        {
          "name": "starting_bid_rfrm",
          "type": "u64"
        },
        {
          "name": "auction_end_time",
          "type": "i64"
        }
      ]
    },
    {
      "name": "initialize_platform",
      "discriminator": [
        119,
        201,
        101,
        45,
        75,
        122,
        89,
        3
      ],
      "accounts": [
        {
          "name": "platform_config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  111,
                  111,
                  107,
                  105,
                  101,
                  95,
                  112,
                  108,
                  97,
                  116,
                  102,
                  111,
                  114,
                  109
                ]
              }
            ]
          }
        },
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "system_program",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "treasury",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "mint_gookie_nft",
      "discriminator": [
        184,
        142,
        146,
        43,
        223,
        213,
        38,
        109
      ],
      "accounts": [
        {
          "name": "platform_config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  111,
                  111,
                  107,
                  105,
                  101,
                  95,
                  112,
                  108,
                  97,
                  116,
                  102,
                  111,
                  114,
                  109
                ]
              }
            ]
          }
        },
        {
          "name": "gookie_auction",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  111,
                  111,
                  107,
                  105,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "gookie_auction.auction_id",
                "account": "GookieAuction"
              }
            ]
          }
        },
        {
          "name": "nft_mint",
          "writable": true,
          "signer": true
        },
        {
          "name": "metadata",
          "writable": true
        },
        {
          "name": "winner",
          "writable": true,
          "signer": true
        },
        {
          "name": "token_metadata_program"
        },
        {
          "name": "token_program",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "system_program",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "rent",
          "address": "SysvarRent111111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "market_id",
          "type": "string"
        }
      ]
    },
    {
      "name": "place_bid",
      "discriminator": [
        238,
        77,
        148,
        91,
        200,
        151,
        92,
        146
      ],
      "accounts": [
        {
          "name": "gookie_auction",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  111,
                  111,
                  107,
                  105,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "gookie_auction.auction_id",
                "account": "GookieAuction"
              }
            ]
          }
        },
        {
          "name": "escrow_token_account",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  111,
                  111,
                  107,
                  105,
                  101,
                  95,
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "gookie_auction"
              }
            ]
          }
        },
        {
          "name": "bidder_token_account",
          "writable": true
        },
        {
          "name": "previous_bidder_token_account",
          "writable": true
        },
        {
          "name": "bidder",
          "writable": true,
          "signer": true
        },
        {
          "name": "token_program",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "bid_amount_rfrm",
          "type": "u64"
        }
      ]
    },
    {
      "name": "release_gookie",
      "discriminator": [
        76,
        31,
        93,
        168,
        152,
        13,
        189,
        237
      ],
      "accounts": [
        {
          "name": "platform_config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  111,
                  111,
                  107,
                  105,
                  101,
                  95,
                  112,
                  108,
                  97,
                  116,
                  102,
                  111,
                  114,
                  109
                ]
              }
            ]
          }
        },
        {
          "name": "gookie_auction",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  111,
                  111,
                  107,
                  105,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "gookie_auction.auction_id",
                "account": "GookieAuction"
              }
            ]
          }
        },
        {
          "name": "escrow_token_account",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  111,
                  111,
                  107,
                  105,
                  101,
                  95,
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "gookie_auction"
              }
            ]
          }
        },
        {
          "name": "winner_token_account",
          "writable": true
        },
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "platform_config"
          ]
        },
        {
          "name": "token_program",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    }
  ],
  "accounts": [
    {
      "name": "GookieAuction",
      "discriminator": [
        96,
        219,
        213,
        3,
        5,
        80,
        101,
        77
      ]
    },
    {
      "name": "PlatformConfig",
      "discriminator": [
        160,
        78,
        128,
        0,
        248,
        83,
        230,
        160
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "NotAdmin",
      "msg": "Only admin can perform this action."
    },
    {
      "code": 6001,
      "name": "AuctionNotActive",
      "msg": "Auction is not active."
    },
    {
      "code": 6002,
      "name": "AuctionStillActive",
      "msg": "Auction has not ended yet."
    },
    {
      "code": 6003,
      "name": "BidTooLow",
      "msg": "Bid amount is too low."
    },
    {
      "code": 6004,
      "name": "NotWinner",
      "msg": "Only the auction winner can perform this action."
    },
    {
      "code": 6005,
      "name": "AlreadyMinted",
      "msg": "NFT has already been minted."
    },
    {
      "code": 6006,
      "name": "NotSlashable",
      "msg": "Cannot slash this auction."
    },
    {
      "code": 6007,
      "name": "InvalidInput",
      "msg": "Invalid input parameters."
    }
  ],
  "types": [
    {
      "name": "AuctionStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "Active"
          },
          {
            "name": "Won"
          },
          {
            "name": "NftMinted"
          },
          {
            "name": "Penalized"
          },
          {
            "name": "Completed"
          }
        ]
      }
    },
    {
      "name": "GookieAuction",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "auction_id",
            "type": "u64"
          },
          {
            "name": "title",
            "type": "string"
          },
          {
            "name": "description",
            "type": "string"
          },
          {
            "name": "starting_bid_rfrm",
            "type": "u64"
          },
          {
            "name": "current_highest_bid",
            "type": "u64"
          },
          {
            "name": "highest_bidder",
            "type": "pubkey"
          },
          {
            "name": "auction_end_time",
            "type": "i64"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "AuctionStatus"
              }
            }
          },
          {
            "name": "nft_mint",
            "type": {
              "option": "pubkey"
            }
          },
          {
            "name": "market_id",
            "type": "string"
          },
          {
            "name": "locked_rfrm",
            "type": "u64"
          },
          {
            "name": "is_slashed",
            "type": "bool"
          },
          {
            "name": "slash_reason",
            "type": "string"
          },
          {
            "name": "fee_approved",
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "PlatformConfig",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "treasury",
            "type": "pubkey"
          },
          {
            "name": "auction_counter",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    }
  ]
} as const;

export type GookieIDL = typeof GOOKIE_IDL;
