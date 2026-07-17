package com.youngsix.msyk;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import org.json.JSONObject;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

final class SecureLoginStore {
    private static final String PREFS = "secure_login";
    private static final String KEY_ALIAS = "msyk_saved_password_v1";
    private static final String TRANSFORMATION = "AES/GCM/NoPadding";

    private final SharedPreferences preferences;

    SecureLoginStore(Context context) {
        preferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    JSONObject get() throws Exception {
        String encrypted = preferences.getString("password", "");
        if (encrypted == null || encrypted.isEmpty()) return null;

        return new JSONObject()
                .put("username", preferences.getString("username", ""))
                .put("password", decrypt(encrypted))
                .put("macAddress", preferences.getString("macAddress", ""));
    }

    void set(JSONObject payload) throws Exception {
        if (!payload.optBoolean("remember", false)) {
            preferences.edit().clear().apply();
            return;
        }

        preferences.edit()
                .putString("username", payload.optString("username", ""))
                .putString("password", encrypt(payload.optString("password", "")))
                .putString("macAddress", payload.optString("macAddress", ""))
                .apply();
    }

    private SecretKey getOrCreateKey() throws Exception {
        KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
        keyStore.load(null);
        if (keyStore.containsAlias(KEY_ALIAS)) {
            return ((KeyStore.SecretKeyEntry) keyStore.getEntry(KEY_ALIAS, null)).getSecretKey();
        }

        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .build());
        return generator.generateKey();
    }

    private String encrypt(String value) throws Exception {
        Cipher cipher = Cipher.getInstance(TRANSFORMATION);
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey());
        byte[] encrypted = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
        byte[] iv = cipher.getIV();
        ByteBuffer output = ByteBuffer.allocate(4 + iv.length + encrypted.length);
        output.putInt(iv.length).put(iv).put(encrypted);
        return Base64.encodeToString(output.array(), Base64.NO_WRAP);
    }

    private String decrypt(String encoded) throws Exception {
        ByteBuffer input = ByteBuffer.wrap(Base64.decode(encoded, Base64.NO_WRAP));
        int ivLength = input.getInt();
        if (ivLength < 12 || ivLength > 32 || input.remaining() <= ivLength) {
            throw new IllegalArgumentException("保存的密码数据无效");
        }
        byte[] iv = new byte[ivLength];
        byte[] encrypted = new byte[input.remaining() - ivLength];
        input.get(iv).get(encrypted);

        Cipher cipher = Cipher.getInstance(TRANSFORMATION);
        cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), new GCMParameterSpec(128, iv));
        return new String(cipher.doFinal(encrypted), StandardCharsets.UTF_8);
    }
}
