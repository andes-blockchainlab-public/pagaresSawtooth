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

const fs = require('fs')
const path = require('path')
require('dotenv').config()

const loadConfig = (defaultValue = {}) => {
  try {
    return require('../config.json')
  } catch (err) {
    // Throw error on bad JSON, otherwise ignore
    if (err instanceof SyntaxError) throw err
    return {}
  }
}

const config = loadConfig()

const initConfigValue = (key, defaultValue = null) => {
  config[key] = process.env[key] || config[key] || defaultValue
}

// Setup non-sensitive config variable with sensible defaults,
// if not set in environment variables or config.json
initConfigValue('RETRY_WAIT', process.env.RETRY_WAIT)
initConfigValue('VALIDATOR_URL', process.env.VALIDATOR_URL)
initConfigValue('DB_HOST', process.env.DB_HOST)
initConfigValue('DB_PORT', process.env.DB_PORT)
initConfigValue('DB_NAME', process.env.DB_NAME)
initConfigValue('PORT', process.env.PORT)
initConfigValue('DEFAULT_SUBMIT_WAIT',  process.env.DEFAULT_SUBMIT_WAIT)
initConfigValue('SIGNING_ALGORITHM', 'secp256k1')

// Setup config variables with no defaults
initConfigValue('MAPS_API_KEY')

// Setup sensitive variable, warning user if using defaults
initConfigValue('JWT_SECRET',  process.env.JWT_SECRET)
initConfigValue('PRIVATE_KEY',  process.env.PRIVATE_KEY)

if (!config.PRIVATE_KEY) {
  config.PRIVATE_KEY = Array(64).fill('1').join('')
  console.warn(
    'WARNING! No signing key provided. Batch signing will be insecure!')
  console.warn(
    'Set "PRIVATE_KEY" as an environment variable or in "config.json" file.')
}

if (!config.JWT_SECRET) {
  config.JWT_SECRET = 'supply-chain-secret'
  console.warn(
    'WARNING! No secret provided. JWT authorization tokens will be insecure!')
  console.warn(
    'Set "JWT_SECRET" as an environment variable or in "config.json" file.')
}

// Config method to set a new value, then write it to config.json
config.set = (key, value) => {
  config[key] = value

  const diskConfig = loadConfig()
  diskConfig[key] = value

  const configPath = path.resolve(__dirname, '../config.json')
  const jsonConfig = JSON.stringify(diskConfig, null, 2)
  fs.writeFile(configPath, jsonConfig, 'utf8', err => {
    if (err) console.error(err)
  })
}

module.exports = config
