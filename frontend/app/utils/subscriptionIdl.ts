export const SUBSCRIPTION_IDL = {
  "address": "FUTVzQF86UckN9KhyuRajM4xRsYS62f24hTbJqGkZxed",
  "metadata": {
    "name": "referandium",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Referandium - Policy Prescription Market on Solana"
  },
  "instructions": [
    {
      "name": "admin_unlock",
      "discriminator": [196, 198, 70, 34, 241, 244, 111, 63],
      "accounts": [
        { "name": "platformState", "writable": false, "signer": false },
        { "name": "userSubscription", "writable": true, "signer": false },
        { "name": "escrowTokenAccount", "writable": true, "signer": false },
        { "name": "userTokenAccount", "writable": true, "signer": false },
        { "name": "authority", "writable": false, "signer": true },
        { "name": "tokenProgram", "writable": false, "signer": false }
      ],
      "args": []
    },
    {
      "name": "extend_subscription",
      "discriminator": [47, 230, 116, 118, 171, 228, 24, 46],
      "accounts": [
        { "name": "userSubscription", "writable": true, "signer": false },
        { "name": "escrowTokenAccount", "writable": true, "signer": false },
        { "name": "userTokenAccount", "writable": true, "signer": false },
        { "name": "user", "writable": true, "signer": true },
        { "name": "tokenProgram", "writable": false, "signer": false }
      ],
      "args": [
        { "name": "rfrmAmount", "type": "u64" },
        { "name": "months", "type": "u8" }
      ]
    },
    {
      "name": "initialize_platform",
      "discriminator": [119, 201, 101, 45, 75, 122, 89, 3],
      "accounts": [
        { "name": "platformState", "writable": true, "signer": false },
        { "name": "authority", "writable": true, "signer": true },
        { "name": "systemProgram", "writable": false, "signer": false }
      ],
      "args": [
        { "name": "requiredUsdPerMonth", "type": "u64" }
      ]
    },
    {
      "name": "lock_rfrm",
      "discriminator": [52, 149, 137, 115, 137, 197, 72, 222],
      "accounts": [
        { "name": "platformState", "writable": false, "signer": false },
        { "name": "userSubscription", "writable": true, "signer": false },
        { "name": "escrowTokenAccount", "writable": true, "signer": false },
        { "name": "userTokenAccount", "writable": true, "signer": false },
        { "name": "rfrmMint", "writable": false, "signer": false },
        { "name": "user", "writable": true, "signer": true },
        { "name": "tokenProgram", "writable": false, "signer": false },
        { "name": "systemProgram", "writable": false, "signer": false },
        { "name": "rent", "writable": false, "signer": false }
      ],
      "args": [
        { "name": "rfrmAmount", "type": "u64" },
        { "name": "months", "type": "u8" }
      ]
    },
    {
      "name": "unlock_rfrm",
      "discriminator": [189, 44, 220, 41, 143, 153, 114, 114],
      "accounts": [
        { "name": "userSubscription", "writable": true, "signer": false },
        { "name": "escrowTokenAccount", "writable": true, "signer": false },
        { "name": "userTokenAccount", "writable": true, "signer": false },
        { "name": "user", "writable": true, "signer": true },
        { "name": "tokenProgram", "writable": false, "signer": false }
      ],
      "args": []
    },
    {
      "name": "update_platform",
      "discriminator": [46, 78, 138, 189, 47, 163, 120, 85],
      "accounts": [
        { "name": "platformState", "writable": true, "signer": false },
        { "name": "authority", "writable": false, "signer": true }
      ],
      "args": [
        { "name": "requiredUsdPerMonth", "type": "u64" }
      ]
    }
  ],
  "accounts": [
    {
      "name": "PlatformState",
      "discriminator": [160, 10, 182, 134, 98, 122, 78, 239]
    },
    {
      "name": "UserSubscription",
      "discriminator": [108, 179, 18, 43, 167, 65, 185, 163]
    }
  ],
  "errors": [
    { "code": 6000, "name": "NotAdmin", "msg": "Only admin can perform this action." },
    { "code": 6001, "name": "SubscriptionStillActive", "msg": "Subscription is still active. Cannot unlock yet." },
    { "code": 6002, "name": "InsufficientAmount", "msg": "Insufficient amount or invalid parameters." },
    { "code": 6003, "name": "AlreadySubscribed", "msg": "User already has an active subscription." }
  ],
  "types": [
    {
      "name": "PlatformState",
      "type": {
        "kind": "struct",
        "fields": [
          { "name": "authority", "type": "pubkey" },
          { "name": "requiredUsdPerMonth", "type": "u64" },
          { "name": "bump", "type": "u8" }
        ]
      }
    },
    {
      "name": "UserSubscription",
      "type": {
        "kind": "struct",
        "fields": [
          { "name": "wallet", "type": "pubkey" },
          { "name": "lockedRfrm", "type": "u64" },
          { "name": "monthsPaid", "type": "u8" },
          { "name": "subscriptionStart", "type": "i64" },
          { "name": "subscriptionExpiry", "type": "i64" },
          { "name": "isActive", "type": "bool" },
          { "name": "bump", "type": "u8" }
        ]
      }
    }
  ]
} as const;

import type { Idl } from '@coral-xyz/anchor';
export type SubscriptionIDL = typeof SUBSCRIPTION_IDL & Idl;
