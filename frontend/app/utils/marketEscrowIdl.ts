export const MARKET_ESCROW_IDL = {
  "address": "Aby8pc1zLWbKUPgPzgh4ntbkTsbPaZWb6FyuxSwtkR8e",
  "metadata": {
    "name": "market_escrow",
    "version": "0.1.0",
    "spec": "0.1.0"
  },
  "instructions": [
    {
      "name": "admin_withdraw_buyback",
      "discriminator": [
        70,
        58,
        69,
        177,
        151,
        160,
        103,
        103
      ],
      "accounts": [
        {
          "name": "platform_config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119,
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
          "name": "market_escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "market_id"
              }
            ]
          }
        },
        {
          "name": "treasury",
          "writable": true,
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
        }
      ],
      "args": [
        {
          "name": "_market_id",
          "type": "string"
        }
      ]
    },
    {
      "name": "close_market",
      "discriminator": [
        88,
        154,
        248,
        186,
        48,
        14,
        123,
        244
      ],
      "accounts": [
        {
          "name": "platform_config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119,
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
          "name": "market_escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "market_id"
              }
            ]
          }
        },
        {
          "name": "treasury",
          "writable": true,
          "relations": [
            "platform_config"
          ]
        },
        {
          "name": "gookie_wallet",
          "writable": true
        },
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "platform_config"
          ]
        }
      ],
      "args": [
        {
          "name": "_market_id",
          "type": "string"
        }
      ]
    },
    {
      "name": "create_market",
      "discriminator": [
        103,
        226,
        97,
        235,
        200,
        188,
        251,
        254
      ],
      "accounts": [
        {
          "name": "platform_config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119,
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
          "name": "market_escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "market_id"
              }
            ]
          }
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
          "name": "system_program",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "market_id",
          "type": "string"
        },
        {
          "name": "gookie_wallet",
          "type": "pubkey"
        },
        {
          "name": "end_time",
          "type": "i64"
        }
      ]
    },
    {
      "name": "deposit_signal",
      "discriminator": [
        80,
        16,
        137,
        33,
        125,
        85,
        212,
        1
      ],
      "accounts": [
        {
          "name": "market_escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "market_id"
              }
            ]
          }
        },
        {
          "name": "user_signal",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  105,
                  103,
                  110,
                  97,
                  108
                ]
              },
              {
                "kind": "arg",
                "path": "market_id"
              },
              {
                "kind": "account",
                "path": "user"
              }
            ]
          }
        },
        {
          "name": "user",
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
          "name": "market_id",
          "type": "string"
        },
        {
          "name": "sol_amount",
          "type": "u64"
        },
        {
          "name": "signal_direction",
          "type": "u8"
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
                  101,
                  115,
                  99,
                  114,
                  111,
                  119,
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
      "name": "set_yield",
      "discriminator": [
        234,
        85,
        157,
        135,
        75,
        39,
        160,
        170
      ],
      "accounts": [
        {
          "name": "platform_config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119,
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
          "name": "market_escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "market_id"
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
      "args": [
        {
          "name": "_market_id",
          "type": "string"
        },
        {
          "name": "yield_amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "withdraw",
      "discriminator": [
        183,
        18,
        70,
        156,
        148,
        109,
        161,
        34
      ],
      "accounts": [
        {
          "name": "market_escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "market_id"
              }
            ]
          }
        },
        {
          "name": "user_signal",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  105,
                  103,
                  110,
                  97,
                  108
                ]
              },
              {
                "kind": "arg",
                "path": "market_id"
              },
              {
                "kind": "account",
                "path": "user"
              }
            ]
          }
        },
        {
          "name": "user",
          "writable": true,
          "signer": true,
          "relations": [
            "user_signal"
          ]
        }
      ],
      "args": [
        {
          "name": "_market_id",
          "type": "string"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "MarketEscrow",
      "discriminator": [
        146,
        173,
        106,
        43,
        105,
        97,
        25,
        180
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
    },
    {
      "name": "UserSignal",
      "discriminator": [
        206,
        179,
        36,
        228,
        11,
        250,
        52,
        234
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
      "name": "MarketNotActive",
      "msg": "Market is not active."
    },
    {
      "code": 6002,
      "name": "MarketNotClosed",
      "msg": "Market is not closed."
    },
    {
      "code": 6003,
      "name": "AlreadySignaled",
      "msg": "User has already signaled on this market."
    },
    {
      "code": 6004,
      "name": "AlreadyWithdrawn",
      "msg": "User has already withdrawn."
    },
    {
      "code": 6005,
      "name": "InsufficientAmount",
      "msg": "Insufficient amount or invalid parameters."
    },
    {
      "code": 6006,
      "name": "FeesNotDistributed",
      "msg": "Fees have not been distributed yet."
    },
    {
      "code": 6007,
      "name": "InvalidSignalDirection",
      "msg": "Invalid signal direction. Must be 0 (NO) or 1 (YES)."
    },
    {
      "code": 6008,
      "name": "InvalidMarketId",
      "msg": "Invalid market ID. Must be <= 100 characters."
    }
  ],
  "types": [
    {
      "name": "MarketEscrow",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market_id",
            "type": "string"
          },
          {
            "name": "gookie_wallet",
            "type": "pubkey"
          },
          {
            "name": "end_time",
            "type": "i64"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "MarketStatus"
              }
            }
          },
          {
            "name": "total_sol_locked",
            "type": "u64"
          },
          {
            "name": "signal_count",
            "type": "u32"
          },
          {
            "name": "total_yield_earned",
            "type": "u64"
          },
          {
            "name": "platform_fee",
            "type": "u64"
          },
          {
            "name": "gookie_fee",
            "type": "u64"
          },
          {
            "name": "user_share_pool",
            "type": "u64"
          },
          {
            "name": "buyback_amount",
            "type": "u64"
          },
          {
            "name": "fees_distributed",
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
      "name": "MarketStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "Active"
          },
          {
            "name": "Closed"
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
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "UserSignal",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market_id",
            "type": "string"
          },
          {
            "name": "user",
            "type": "pubkey"
          },
          {
            "name": "sol_amount",
            "type": "u64"
          },
          {
            "name": "signal_direction",
            "type": "u8"
          },
          {
            "name": "yield_claimed",
            "type": "bool"
          },
          {
            "name": "withdrawn",
            "type": "bool"
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

export type MarketEscrowIDL = typeof MARKET_ESCROW_IDL;
