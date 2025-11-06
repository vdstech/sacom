import argon2 from 'argon2'

export async function hashPassword(plain) {
    return argon2.hash(plain, {type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1})
}

export async function verify(plain, hash) {
    return argon2.verify(hash, plain)
}