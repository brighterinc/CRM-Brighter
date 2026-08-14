/**
 * `FakeSecretEncryptionProvider` — double determinístico e REVERSÍVEL pra
 * teste/CLI/simulação, mesma doutrina de `InMemoryRuntimeVaultProvider`:
 * nunca usado em produção, nunca toca rede/banco/pgcrypto real. Não é
 * criptografia de verdade — é um transform simples (chave XOR fixa por
 * instância + prefixo de marca), suficiente pra provar o FLUXO completo
 * (encrypt -> guardar ciphertext -> decrypt -> valor original) sem depender
 * de Postgres.
 *
 * `key` (default `"fake-test-key-never-real"`) simula "chave mestra errada"
 * pra teste de `wrong-key`: duas instâncias com `key` diferente NUNCA
 * decifram o ciphertext uma da outra — `decrypt()` lança
 * `SecretDecryptionFailedError`, igual o comportamento esperado de
 * `pgp_sym_decrypt` com chave errada.
 *
 * `corruptNextCiphertext()` simula ciphertext corrompido/truncado — a
 * próxima chamada de `decrypt()` recebe um payload deliberadamente
 * adulterado e deve falhar.
 */
import { SecretDecryptionFailedError, type EncryptedSecretPayload, type SecretEncryptionProvider, type SecretEncryptionProviderHealth } from "./encryption";

const MARKER = "fake-vault-v1:";

function xor(buffer: Buffer, key: string): Buffer {
  const keyBuf = Buffer.from(key, "utf8");
  const out = Buffer.alloc(buffer.length);
  for (let i = 0; i < buffer.length; i++) {
    out[i] = buffer[i]! ^ keyBuf[i % keyBuf.length]!;
  }
  return out;
}

export class FakeSecretEncryptionProvider implements SecretEncryptionProvider {
  readonly id = "fake" as const;

  private readonly key: string;
  private corruptNext = false;

  constructor(key = "fake-test-key-never-real") {
    this.key = key;
  }

  /** Só pra teste — a PRÓXIMA chamada de `decrypt()` recebe ciphertext adulterado. */
  corruptNextCiphertext(): void {
    this.corruptNext = true;
  }

  async encrypt(plaintext: string): Promise<EncryptedSecretPayload> {
    const withMarker = Buffer.from(MARKER + plaintext, "utf8");
    return { ciphertext: xor(withMarker, this.key), encryptionScheme: "fake_xor_v1", keyId: "fake-default" };
  }

  async decrypt(payload: Pick<EncryptedSecretPayload, "ciphertext" | "encryptionScheme" | "keyId">): Promise<string> {
    if (payload.encryptionScheme !== "fake_xor_v1") {
      throw new SecretDecryptionFailedError(this.id, `encryption scheme desconhecido: "${payload.encryptionScheme}"`);
    }

    let ciphertext = payload.ciphertext;
    if (this.corruptNext) {
      this.corruptNext = false;
      // Corrompe os PRIMEIROS bytes (cobrem o marcador `MARKER` depois do
      // XOR) — corromper só o final deixaria o prefixo decodificado intacto
      // e o marcador ainda bateria, mascarando a corrupção.
      const corruptedHead = Buffer.from([1, 2, 3, 4]);
      ciphertext = Buffer.concat([corruptedHead, ciphertext.subarray(Math.min(corruptedHead.length, ciphertext.length))]);
    }

    let decoded: string;
    try {
      decoded = xor(ciphertext, this.key).toString("utf8");
    } catch {
      throw new SecretDecryptionFailedError(this.id, "falha ao decodificar ciphertext");
    }

    if (!decoded.startsWith(MARKER)) {
      throw new SecretDecryptionFailedError(this.id, "chave incorreta ou ciphertext corrompido — marcador ausente");
    }
    return decoded.slice(MARKER.length);
  }

  async healthPreview(): Promise<SecretEncryptionProviderHealth> {
    return { id: this.id, available: true, message: "Fake — só teste/simulação, nunca criptografia real." };
  }
}
