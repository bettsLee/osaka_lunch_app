package com.osakalunch.backend.push;

import javax.crypto.Cipher;
import javax.crypto.KeyAgreement;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.math.BigInteger;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.AlgorithmParameters;
import java.security.GeneralSecurityException;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.Signature;
import java.security.interfaces.ECPrivateKey;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECFieldFp;
import java.security.spec.ECGenParameterSpec;
import java.security.spec.ECParameterSpec;
import java.security.spec.ECPoint;
import java.security.spec.ECPrivateKeySpec;
import java.security.spec.ECPublicKeySpec;
import java.util.Arrays;
import java.util.Base64;

/**
 * 웹 푸시 한 건에 필요한 암호 작업. JDK 기본 기능만 씀 (라이브러리 추가 없음)
 * - 내용 암호화: RFC 8291 (aes128gcm). 브라우저가 구독할 때 준 공개 키(p256dh)와 비밀(auth)로 암호화
 * - 보내는 서버 증명: RFC 8292 VAPID. 우리 비밀 키로 서명한 짧은 토큰을 Authorization 헤더에 붙임
 */
public final class WebPushCrypto {

    static final int RECORD_SIZE = 4096;
    static final int MAX_PLAINTEXT = 3000; // 한 레코드(4096바이트) 안에 넉넉히 들어가게

    private static final ECParameterSpec P256 = p256();

    private WebPushCrypto() {
    }

    /** 브라우저 공개 키(65바이트 비압축)와 auth(16바이트)로 내용 암호화. salt · 보내는 쪽 임시 키는 시험할 때만 고정 */
    static byte[] encrypt(byte[] plaintext, byte[] uaPublic, byte[] authSecret, KeyPair asKeys, byte[] salt)
            throws GeneralSecurityException {
        if (plaintext.length > MAX_PLAINTEXT) throw new IllegalArgumentException("알림 내용이 너무 길어요");
        if (authSecret.length != 16) throw new IllegalArgumentException("auth는 16바이트");
        if (salt.length != 16) throw new IllegalArgumentException("salt는 16바이트");
        ECPublicKey ua = publicKey(uaPublic);
        byte[] asPublic = uncompressed((ECPublicKey) asKeys.getPublic());

        KeyAgreement ka = KeyAgreement.getInstance("ECDH");
        ka.init(asKeys.getPrivate());
        ka.doPhase(ua, true);
        byte[] ecdhSecret = ka.generateSecret();

        // IKM = HKDF(auth, ecdh, "WebPush: info" 0x00 ua_public as_public, 32)
        byte[] keyInfo = concat("WebPush: info".getBytes(StandardCharsets.US_ASCII), new byte[]{0}, uaPublic, asPublic);
        byte[] ikm = expand(hmac(authSecret, ecdhSecret), keyInfo, 32);
        byte[] prk = hmac(salt, ikm);
        byte[] cek = expand(prk, concat("Content-Encoding: aes128gcm".getBytes(StandardCharsets.US_ASCII), new byte[]{0}), 16);
        byte[] nonce = expand(prk, concat("Content-Encoding: nonce".getBytes(StandardCharsets.US_ASCII), new byte[]{0}), 12);

        Cipher gcm = Cipher.getInstance("AES/GCM/NoPadding");
        gcm.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(cek, "AES"), new GCMParameterSpec(128, nonce));
        byte[] cipher = gcm.doFinal(concat(plaintext, new byte[]{2})); // 0x02 = 마지막 레코드 표시

        // 머리: salt(16) | 레코드 크기(4) | 키 길이(1) | 보내는 쪽 공개 키(65)
        ByteBuffer header = ByteBuffer.allocate(16 + 4 + 1 + asPublic.length);
        header.put(salt).putInt(RECORD_SIZE).put((byte) asPublic.length).put(asPublic);
        return concat(header.array(), cipher);
    }

    /** 실제 발송용: salt와 임시 키를 매번 새로 만듦 */
    public static byte[] encrypt(byte[] plaintext, byte[] uaPublic, byte[] authSecret) throws GeneralSecurityException {
        KeyPairGenerator gen = KeyPairGenerator.getInstance("EC");
        gen.initialize(new ECGenParameterSpec("secp256r1"));
        byte[] salt = new byte[16];
        new java.security.SecureRandom().nextBytes(salt);
        return encrypt(plaintext, uaPublic, authSecret, gen.generateKeyPair(), salt);
    }

    /** VAPID 토큰 (ES256 JWT). aud = 푸시 서비스 주소의 출처, sub = 연락처(https 주소 또는 mailto) */
    public static String vapidJwt(String audience, String subject, long expiresAtEpochSec, ECPrivateKey key)
            throws GeneralSecurityException {
        String header = b64(json("typ", "JWT", "alg", "ES256"));
        String claims = b64(("{\"aud\":" + quote(audience) + ",\"exp\":" + expiresAtEpochSec + ",\"sub\":" + quote(subject) + "}")
                .getBytes(StandardCharsets.UTF_8));
        String input = header + "." + claims;
        Signature es256 = Signature.getInstance("SHA256withECDSAinP1363Format"); // r|s 64바이트 그대로 (JWT 형식)
        es256.initSign(key);
        es256.update(input.getBytes(StandardCharsets.US_ASCII));
        return input + "." + b64(es256.sign());
    }

    /** 비압축 공개 키(0x04 | x | y) → 키 객체 */
    public static ECPublicKey publicKey(byte[] uncompressed) throws GeneralSecurityException {
        if (uncompressed.length != 65 || uncompressed[0] != 4) throw new IllegalArgumentException("공개 키 형식이 아니에요");
        BigInteger x = new BigInteger(1, Arrays.copyOfRange(uncompressed, 1, 33));
        BigInteger y = new BigInteger(1, Arrays.copyOfRange(uncompressed, 33, 65));
        // P-256 곡선 위의 점인지 (y² = x³ + ax + b mod p). 아니면 저장할 때 바로 거절
        BigInteger p = ((ECFieldFp) P256.getCurve().getField()).getP();
        BigInteger rhs = x.pow(3).add(P256.getCurve().getA().multiply(x)).add(P256.getCurve().getB()).mod(p);
        if (x.compareTo(p) >= 0 || y.compareTo(p) >= 0 || !y.modPow(BigInteger.TWO, p).equals(rhs)) {
            throw new IllegalArgumentException("공개 키가 P-256 곡선 위의 점이 아니에요");
        }
        return (ECPublicKey) KeyFactory.getInstance("EC").generatePublic(new ECPublicKeySpec(new ECPoint(x, y), P256));
    }

    /** 비밀 키 숫자 32바이트 → 키 객체 (web-push 도구가 만든 privateKey 값) */
    public static ECPrivateKey privateKey(byte[] d) throws GeneralSecurityException {
        if (d.length != 32) throw new IllegalArgumentException("비밀 키는 32바이트");
        return (ECPrivateKey) KeyFactory.getInstance("EC").generatePrivate(new ECPrivateKeySpec(new BigInteger(1, d), P256));
    }

    public static byte[] uncompressed(ECPublicKey key) {
        return concat(new byte[]{4}, fixed32(key.getW().getAffineX()), fixed32(key.getW().getAffineY()));
    }

    public static byte[] unb64(String s) {
        return Base64.getUrlDecoder().decode(s.trim().replace('+', '-').replace('/', '_').replace("=", ""));
    }

    public static String b64(byte[] bytes) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private static byte[] hmac(byte[] key, byte[] data) throws GeneralSecurityException {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(key, "HmacSHA256"));
        return mac.doFinal(data);
    }

    /** HKDF-Expand에서 32바이트 이하만 필요해서 블록 하나로 끝남 */
    private static byte[] expand(byte[] prk, byte[] info, int length) throws GeneralSecurityException {
        return Arrays.copyOf(hmac(prk, concat(info, new byte[]{1})), length);
    }

    private static byte[] fixed32(BigInteger n) {
        byte[] raw = n.toByteArray();
        byte[] out = new byte[32];
        int copy = Math.min(raw.length, 32);
        System.arraycopy(raw, raw.length - copy, out, 32 - copy, copy);
        return out;
    }

    private static byte[] concat(byte[]... parts) {
        int len = 0;
        for (byte[] p : parts) len += p.length;
        byte[] out = new byte[len];
        int at = 0;
        for (byte[] p : parts) {
            System.arraycopy(p, 0, out, at, p.length);
            at += p.length;
        }
        return out;
    }

    private static byte[] json(String k1, String v1, String k2, String v2) {
        return ("{" + quote(k1) + ":" + quote(v1) + "," + quote(k2) + ":" + quote(v2) + "}").getBytes(StandardCharsets.UTF_8);
    }

    private static String quote(String s) {
        return "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"") + "\"";
    }

    private static ECParameterSpec p256() {
        try {
            AlgorithmParameters params = AlgorithmParameters.getInstance("EC");
            params.init(new ECGenParameterSpec("secp256r1"));
            return params.getParameterSpec(ECParameterSpec.class);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }
}
