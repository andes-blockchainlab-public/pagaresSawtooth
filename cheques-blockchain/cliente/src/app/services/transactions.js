/**
 * Copyright 2017 Intel Corporation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * ----------------------------------------------------------------------------
 */
'use strict'
import * as m from "mithril";
import * as _ from "lodash";
import * as shajs from 'sha.js';
import * as sjcl from "sjcl";
import { createHash } from "crypto";
const secp256k1 = require('sawtooth-sdk/signing/secp256k1')
const {
  Transaction,
  TransactionHeader,
  TransactionList
} = require('sawtooth-sdk/protobuf')
const api = require('../services/api')

const STORAGE_KEY = 'asset_track.encryptedKey'
const FAMILY_NAME = 'supply_chain'
const FAMILY_VERSION = '1.1'
const NAMESPACE = '3400de'

const context = new secp256k1.Secp256k1Context()
let privateKey = null
let signerPublicKey = null
let batcherPublicKey = null

export const setBatcherPubkey = () => {
  return api.get('info')
    .then(({ pubkey }) => { batcherPublicKey = pubkey })
}
setBatcherPubkey()

export const requestPassword = () => {
  let password = null

  return modals.show(modals.BasicModal, {
    title: 'Enter Password',
    acceptText: 'Submit',
    body: m('.container', [
      m('.mb-4', 'Please confirm your password to unlock your signing key.'),
      m('input.form-control', {
        type: 'password',
        oninput: m.withAttr('value', value => { password = value })
      })
    ])
  })
    .then(() => password)
}

export const createTxn = payload => {


  let t = shajs('sha256').update(payload).digest('hex')

  const header = TransactionHeader.encode({
    signerPublicKey,
    batcherPublicKey,
    familyName: FAMILY_NAME,
    familyVersion: FAMILY_VERSION,
    inputs: [NAMESPACE],
    outputs: [NAMESPACE],
    nonce: (Math.random() * 10 ** 18).toString(36),
    payloadSha512: t,
  }).finish()

  return Transaction.create({
    payload,
    header,
    headerSignature: context.sign(header, privateKey)
  })
}

export const encodeTxns = transactions => {
  return TransactionList.encode({ transactions }).finish()
}

/**
 * Generates a new private key, saving it it to memory and storage (encrypted).
 * Returns both a public key and the encrypted private key.
 */
export const makePrivateKey = password => {
  privateKey = context.newRandomPrivateKey()
  console.log(context.getPublicKey(privateKey))
  signerPublicKey = context.getPublicKey(privateKey).asHex()

  const encryptedKey = sjcl.encrypt(password, privateKey.asHex())
  window.localStorage.setItem(STORAGE_KEY, encryptedKey)

  return { encryptedKey, publicKey: signerPublicKey, privateKey: privateKey.asHex() }
}

/**
 * Saves an encrypted key to storage, and the decrypted version in memory.
 */
export const setPrivateKey = (password, encryptedKey) => {
  const privateKeyHex = sjcl.decrypt(password, encryptedKey)

  privateKey = secp256k1.Secp256k1PrivateKey.fromHex(privateKeyHex)
  signerPublicKey = context.getPublicKey(privateKey).asHex()

  window.localStorage.setItem(STORAGE_KEY, encryptedKey)

  return encryptedKey
}

/**
 * Clears the users private key from memory and storage.
 */
export const clearPrivateKey = () => {
  const encryptedKey = window.localStorage.getItem(STORAGE_KEY)

  window.localStorage.clear(STORAGE_KEY)
  privateKey = null
  signerPublicKey = null

  return encryptedKey
}

/**
 * Returns the user's private key as promised, requesting password as needed.
 */
export const getPrivateKey = () => {
  return Promise.resolve()
  .then(() => {
    if (privateKey) return privateKey.asHex()
    const encryptedKey = window.localStorage.getItem(STORAGE_KEY)
    return requestPassword()
      .then(password => sjcl.decrypt(password, encryptedKey))
  })
}

/**
 * Re-encrypts a private key with a new password.
 */
export const changePassword = password => {
  return getPrivateKey()
    .then(privateKey => {
      const encryptedKey = sjcl.encrypt(password, privateKey)
      window.localStorage.setItem(STORAGE_KEY, encryptedKey)
      return encryptedKey
    })
}

/**
 * Wraps a Protobuf payload in a TransactionList and submits it to the API.
 * Prompts user for their password if their private key is not in memory.
 */
export const submit = (payloads, wait = false) => {
  console.log(payloads)
  if (!_.isArray(payloads)) payloads = [payloads]
  return Promise.resolve()
    .then(() => {
      if (privateKey) return

      return requestPassword()
        .then(password => {
          const encryptedKey = window.localStorage.getItem(STORAGE_KEY)
          setPrivateKey(password, encryptedKey)
        })
    })
    .then(() => {

      if (batcherPublicKey) return
      return setBatcherPubkey()
    })
    .then(() => {


      const txns = payloads.map(payload => createTxn(payload))

      const txnList = encodeTxns(txns)
      console.log("payload2")
      return api.postBinary(`transactions${wait ? '?wait' : ''}`, txnList)
    })
}


