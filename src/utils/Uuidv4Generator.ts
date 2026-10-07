import * as crypto from 'crypto'

export default class Uuidv4Generator {
    public static generateUuid(): string {
        return Uuidv4Generator.v4()
    }

    public static generateEntityId(prefix: string): string {
        return `${prefix}-${Uuidv4Generator.generateUuid()}`
    }

    private static v4() {
        const r = crypto.randomFillSync(new Uint8Array(16))
        // tslint:disable-next-line:no-bitwise
        r[6] = (r[6] & 0x0f) | 0x40
        // tslint:disable-next-line:no-bitwise
        r[8] = (r[8] & 0x3f) | 0x80

        return Uuidv4Generator.bytesToUUID(r)
    }

    private static bytesToUUID(buf: Uint8Array): string {
        const byteToHex = []
        const idx = 0

        for (let i = 0; i < 256; ++i) {
            byteToHex.push((i + 0x100).toString(16).substr(1))
        }

        const bth = byteToHex

        return (
            bth[buf[idx + 0]] +
            bth[buf[idx + 1]] +
            bth[buf[idx + 2]] +
            bth[buf[idx + 3]] +
            '-' +
            bth[buf[idx + 4]] +
            bth[buf[idx + 5]] +
            '-' +
            bth[buf[idx + 6]] +
            bth[buf[idx + 7]] +
            '-' +
            bth[buf[idx + 8]] +
            bth[buf[idx + 9]] +
            '-' +
            bth[buf[idx + 10]] +
            bth[buf[idx + 11]] +
            bth[buf[idx + 12]] +
            bth[buf[idx + 13]] +
            bth[buf[idx + 14]] +
            bth[buf[idx + 15]]
        ).toLowerCase()
    }
}
