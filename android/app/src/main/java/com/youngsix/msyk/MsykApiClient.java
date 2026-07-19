package com.youngsix.msyk;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Base64;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.MessageDigest;
import java.security.PublicKey;
import java.security.spec.X509EncodedKeySpec;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.TimeZone;
import java.util.TreeMap;
import java.util.UUID;
import java.util.zip.GZIPInputStream;

import javax.crypto.Cipher;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

final class MsykApiClient {
    private static final String BASE_URL = "https://padapp.msyk.cn";
    private static final String SECRET_KEY = "DxlE8wwbZt8Y2ULQfgGywAgZfJl82G9S";
    private static final String PUBLIC_KEY64 =
            "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAj7YWxpOwulFyf+zQU77Y2cd9chZUMfiwokgUaigyeD8ac5E8LQpVHWzkm+1CuzH0GxTCWvAUVHWfefOEe4AThk4AbFBNCXqB+MqofroED6Uec1jrLGNcql9IWX3CN2J6mqJQ8QLB/xPg/7FUTmd8KtGPrtOrKKP64BM5cqaB1xCc4xmQTuWvtK9fRei6LVTHZyH0Ui7nP/TSF3PJV3ywMlkkQxKi8JBkz1fx1ZO5TVLYRKxzMQdeD6whq+kOsSXhlLIiC/Y8skdBJmsBWDMfQXxtMr5CyFbVMrG+lip/V5n22EdigHcLOmFW9nnB+sgiifLHeXx951lcTmaGy4uChQIDAQAB";
    private static final String USER_AGENT = "okhttp/3.12.1";
    private static final String OSS_BUCKET = "msyk";
    private static final String OSS_ENDPOINT = "oss-cn-shanghai.aliyuncs.com";
    private static final String OSS_PUBLIC_BASE = "https://msyk.wpstatic.cn/";
    private static final int MAX_UPLOAD_BASE64_LENGTH = 80 * 1024 * 1024;
    private static final long PENDING_UPLOAD_TTL_MS = 5 * 60 * 1000L;

    private final SharedPreferences preferences;
    private final SecureLoginStore secureLoginStore;
    private final Map<String, PendingUpload> pendingUploads = new LinkedHashMap<>();
    private JSONObject session;

    MsykApiClient(Context context) {
        preferences = context.getSharedPreferences("msyk_native", Context.MODE_PRIVATE);
        secureLoginStore = new SecureLoginStore(context);
        session = parseObject(preferences.getString("session", ""));
        if (session == null) session = new JSONObject();
    }

    boolean hasSession() {
        return !sessionValue("sessionSign").isEmpty()
                && !sessionValue("studentId").isEmpty()
                && !sessionValue("unitId").isEmpty();
    }

    Object invoke(String method, JSONObject payload) throws Exception {
        switch (method) {
            case "apiLogin":
                return login(payload);
            case "apiGetSession":
                return ok(new JSONObject(session.toString()));
            case "apiLogout":
                session = new JSONObject();
                preferences.edit().remove("session").apply();
                return ok(null);
            case "getSavedLogin":
                return ok(secureLoginStore.get());
            case "setSavedLogin":
                secureLoginStore.set(payload);
                return ok(null);
            case "debugGet":
                return preferences.getBoolean("debugMode", false);
            case "debugSet":
                boolean enabled = payload.optBoolean("enabled", false);
                preferences.edit().putBoolean("debugMode", enabled).apply();
                return enabled;
            case "homeStats":
                return wrap(postSigned("/ws/student/statisticUsedInfo", params(
                        "studentId", requireSession("studentId"))));
            case "hwSubjects":
                return wrap(postSigned("/ws/student/homework/studentHomework/searchSubjectInfo", params(
                        "studentId", requireSession("studentId"),
                        "unitId", requireSession("unitId"))));
            case "hwList":
                return homeworkList(payload);
            case "hwStatus":
                return homeworkStatus(payload);
            case "hwPptInfo":
                return wrap(postSigned("/ws/student/homework/studentHomework/homeworkPPTInfo", params(
                        "pptResourceId", required(payload, "pptResourceId"),
                        "resSource", value(payload, "resSource", "1"))));
            case "hwCardPreviewUrl":
                return cardPreviewUrl(payload);
            case "checkHomeworkEndTime":
                return wrap(postSigned("/ws/student/homework/studentHomework/checkHomeworkEndTime", params(
                        "homeworkId", required(payload, "homeworkId"),
                        "unitId", value(payload, "unitId", requireSession("unitId")))));
            case "getHomeworkCardInfo":
                return homeworkCardInfo(payload);
            case "getCorrectAnswers":
                return correctAnswers(payload);
            case "getHomeworkTime":
                return wrap(postSigned("/ws/common/homework/homeworkStatus/getTime", params(
                        "homeworkId", required(payload, "homeworkId"),
                        "studentId", value(payload, "studentId", requireSession("studentId")),
                        "unitId", value(payload, "unitId", requireSession("unitId")))));
            case "saveCardAnswer":
                return saveCardAnswer(payload);
            case "saveCardAnswerObjectives":
                return saveCardAnswerObjectives(payload);
            case "addStudentExplainSign":
                return wrap(postSigned("/ws/student/homeworkChecked/addStudentExplainSign", params(
                        "studentId", value(payload, "studentId", requireSession("studentId")),
                        "homeworkId", required(payload, "homeworkId"),
                        "homeworkResourceIds", value(payload, "homeworkResourceIds", "[]"),
                        "unitId", value(payload, "unitId", requireSession("unitId")))));
            case "uploadHomeworkMedia":
                return uploadHomeworkMedia(payload);
            case "uploadHomeworkMediaStart":
                return startHomeworkMediaUpload(payload);
            case "uploadHomeworkMediaChunk":
                return appendHomeworkMediaChunk(payload);
            case "uploadHomeworkMediaFinish":
                return finishHomeworkMediaUpload(payload);
            case "removeCardAnswer":
                return removeCardAnswer(payload);
            case "submitReadTime":
                return submitReadTime(payload);
            case "submitReadCountTime":
                return submitReadCountTime(payload);
            default:
                return failure(404, "Android API 未实现: " + method);
        }
    }

    private JSONObject login(JSONObject payload) throws Exception {
        String userName = required(payload, "userName");
        String password = required(payload, "password");
        String macAddress = value(payload, "macAddress", "02:00:00:00:00:00");
        String sn = value(payload, "sn", "unknown");
        String versionCode = value(payload, "versionCode", "35");

        Map<String, String> loginParams = params(
                "userName", userName,
                "auth", md5Hex(userName + password + "HHOO"),
                "macAddress", macAddress,
                "sn", sn,
                "versionCode", versionCode);
        String salt = String.valueOf(System.currentTimeMillis());
        Map<String, String> form = new LinkedHashMap<>(loginParams);
        form.put("salt", salt);
        form.put("sign", "");
        form.put("key", buildKey(loginParams, salt, ""));

        ApiResponse response = request(BASE_URL + "/ws/app/padLogin", "POST", form, null);
        JSONObject data = requireBusiness(response, "登录");
        JSONObject nested = data.optJSONObject("data");
        String serverSign = firstNonEmpty(
                data.optString("serverSign", ""),
                data.optString("sign", ""),
                nested == null ? "" : nested.optString("serverSign", ""),
                nested == null ? "" : nested.optString("sign", ""));
        if (serverSign.isEmpty()) throw new IllegalStateException("padLogin 缺少 serverSign");

        JSONObject info = data.optJSONObject("InfoMap");
        if (info == null) info = data.optJSONObject("infoMap");
        if (info == null && nested != null) info = nested.optJSONObject("InfoMap");
        if (info == null && nested != null) info = nested.optJSONObject("infoMap");
        if (info == null) info = new JSONObject();

        String studentId = firstNonEmpty(
                info.optString("id", ""),
                data.optString("studentId", ""),
                nested == null ? "" : nested.optString("studentId", ""),
                data.optString("userId", ""));
        String unitId = firstNonEmpty(
                info.optString("unitId", ""),
                data.optString("unitId", ""),
                nested == null ? "" : nested.optString("unitId", ""),
                data.optString("schoolId", ""));
        if (studentId.isEmpty() || unitId.isEmpty()) {
            throw new IllegalStateException("登录响应缺少 studentId/unitId");
        }

        session = new JSONObject()
                .put("sessionSign", decodeServerSign(serverSign))
                .put("studentId", studentId)
                .put("unitId", unitId)
                .put("schoolId", firstNonEmpty(data.optString("schoolId", ""), unitId))
                .put("schoolName", firstNonEmpty(
                        info.optString("schoolName", ""),
                        data.optString("schoolName", ""),
                        nested == null ? "" : nested.optString("schoolName", "")))
                .put("className", firstNonEmpty(
                        info.optString("groupName", ""),
                        info.optString("className", ""),
                        data.optString("groupName", ""),
                        data.optString("className", ""),
                        nested == null ? "" : nested.optString("groupName", ""),
                        nested == null ? "" : nested.optString("className", "")))
                .put("ip", data.optString("ip", ""))
                .put("userName", firstNonEmpty(info.optString("userName", ""), userName))
                .put("realName", firstNonEmpty(info.optString("realName", ""), data.optString("realName", "")))
                .put("macAddress", macAddress)
                .put("sn", sn)
                .put("versionCode", versionCode);
        preferences.edit().putString("session", session.toString()).apply();
        return ok(new JSONObject(session.toString()));
    }

    private JSONObject homeworkList(JSONObject payload) throws Exception {
        return wrap(postSigned("/ws/student/homework/studentHomework/getHomeworkList", params(
                "studentId", requireSession("studentId"),
                "subjectCode", value(payload, "subjectCode", ""),
                "homeworkType", value(payload, "homeworkType", "-1"),
                "pageIndex", value(payload, "pageIndex", "1"),
                "pageSize", value(payload, "pageSize", "12"),
                "statu", value(payload, "statu", "1"),
                "homeworkName", value(payload, "homeworkName", ""),
                "unitId", requireSession("unitId"),
                "startTime", value(payload, "startTime", "0"),
                "endTime", value(payload, "endTime", "0"))));
    }

    private JSONObject homeworkStatus(JSONObject payload) throws Exception {
        return wrap(postSigned("/ws/common/homework/homeworkStatus", params(
                "homeworkId", required(payload, "homeworkId"),
                "modifyNum", value(payload, "modifyNum", "0"),
                "userId", value(payload, "userId", requireSession("studentId")),
                "unitId", value(payload, "unitId", requireSession("unitId")))));
    }

    private JSONObject homeworkCardInfo(JSONObject payload) throws Exception {
        return wrap(postSigned("/ws/teacher/homeworkCard/getHomeworkCardInfo", params(
                "homeworkId", required(payload, "homeworkId"),
                "studentId", value(payload, "studentId", requireSession("studentId")),
                "modifyNum", value(payload, "modifyNum", "0"),
                "unitId", value(payload, "unitId", requireSession("unitId")))));
    }

    private JSONObject correctAnswers(JSONObject payload) throws Exception {
        if (!preferences.getBoolean("debugMode", false)) {
            return failure(403, "仅调试模式可用");
        }
        Map<String, String> query = params(
                "homeworkId", required(payload, "homeworkId"),
                "studentId", "",
                "modifyNum", value(payload, "modifyNum", "0"),
                "unitId", value(payload, "unitId", requireSession("unitId")));
        return wrap(request(
                BASE_URL + "/ws/teacher/homeworkCard/getHomeworkCardInfo?" + encodeForm(query),
                "GET",
                null,
                null));
    }

    private JSONObject cardPreviewUrl(JSONObject payload) throws Exception {
        Map<String, String> signed = params(
                "studentId", requireSession("studentId"),
                "homeworkId", required(payload, "homeworkId"),
                "isShowAnswer", value(payload, "isShowAnswer", "1"),
                "unitId", requireSession("unitId"),
                "endHomeworkModel", value(payload, "endHomeworkModel", "1"),
                "modifyNum", value(payload, "modifyNum", "0"));
        String salt = String.valueOf(System.currentTimeMillis());
        String sign = requireSession("sessionSign");
        Map<String, String> query = new LinkedHashMap<>(signed);
        query.put("salt", salt);
        query.put("sign", sign);
        query.put("key", buildKey(signed, salt, sign));
        String url = "https://www.msyk.cn/webview/newQuestion/studentHomeworkCardPreview?" + encodeForm(query);
        return ok(new JSONObject().put("url", url));
    }

    private JSONObject saveCardAnswer(JSONObject payload) throws Exception {
        long now = System.currentTimeMillis();
        String startTime = value(payload, "startTime", "");
        String endTime = value(payload, "endTime", String.valueOf(now));
        if (endTime.isEmpty()) endTime = String.valueOf(now);
        String usedTime = value(payload, "time", "");
        if (usedTime.isEmpty()) {
            try {
                usedTime = !startTime.isEmpty()
                        ? String.valueOf(Math.max(0, (Long.parseLong(endTime) - Long.parseLong(startTime)) / 1000))
                        : "0";
            } catch (NumberFormatException ignored) {
                usedTime = "0";
            }
        }
        return wrap(postSigned("/ws/teacher/homeworkCard/saveCardAnswer", params(
                "answerInfo", value(payload, "answerInfo", "[]"),
                "studentId", value(payload, "studentId", requireSession("studentId")),
                "homeworkId", required(payload, "homeworkId"),
                "type", value(payload, "type", "0"),
                "startTime", startTime,
                "endTime", endTime,
                "time", usedTime,
                "modifyNum", value(payload, "modifyNum", "0"),
                "unitId", value(payload, "unitId", requireSession("unitId")))));
    }

    private JSONObject saveCardAnswerObjectives(JSONObject payload) throws Exception {
        return wrap(postSigned("/ws/teacher/homeworkCard/saveCardAnswerObjectives", params(
                "serialNumbers", value(payload, "serialNumbers", ""),
                "answers", value(payload, "answers", ""),
                "studentId", value(payload, "studentId", requireSession("studentId")),
                "homeworkId", required(payload, "homeworkId"),
                "unitId", value(payload, "unitId", requireSession("unitId")),
                "modifyNum", value(payload, "modifyNum", "0"))));
    }

    private JSONObject removeCardAnswer(JSONObject payload) throws Exception {
        String answerId = required(payload, "answerId");
        if ("-1".equals(answerId) || "-10001".equals(answerId)) {
            throw new IllegalArgumentException("删除作业媒体缺少有效 answerId");
        }
        ApiResponse response = postSigned("/ws/teacher/homeworkCard/studentRemoveAnswer", params(
                "answerId", answerId,
                "unitId", value(payload, "unitId", requireSession("unitId"))));
        JSONObject result = wrap(response);
        if (result.optInt("code") != 200) return result;
        Object data = result.opt("data");
        if (data instanceof JSONObject) {
            String businessCode = ((JSONObject) data).optString("code", "");
            if (!businessCode.isEmpty() && !"10000".equals(businessCode)) {
                return failure(500, ((JSONObject) data).optString("message", "删除失败"));
            }
        }
        return result;
    }

    private JSONObject submitReadTime(JSONObject payload) throws Exception {
        return wrap(postSigned("/ws/student/homework/studentHomework/readHomeworksubmitTime", params(
                "homeworkId", required(payload, "homeworkId"),
                "resourceId", required(payload, "resourceId"),
                "studentId", value(payload, "studentId", requireSession("studentId")),
                "quesNum", value(payload, "quesNum", ""),
                "usedTime", value(payload, "usedTime", String.valueOf(System.currentTimeMillis())),
                "unitId", value(payload, "unitId", requireSession("unitId")))));
    }

    private JSONObject submitReadCountTime(JSONObject payload) throws Exception {
        String now = String.valueOf(System.currentTimeMillis());
        return wrap(postSigned("/ws/common/homework/homeworkStatus/readHomeworkModify", params(
                "homeworkId", required(payload, "homeworkId"),
                "userId", value(payload, "userId", requireSession("studentId")),
                "groupId", value(payload, "groupId", ""),
                "startTime", value(payload, "startTime", now),
                "endTime", value(payload, "endTime", now),
                "time", value(payload, "time", now),
                "unitId", value(payload, "unitId", requireSession("unitId")))));
    }

    private JSONObject uploadHomeworkMedia(JSONObject payload) throws Exception {
        int mediaType = Integer.parseInt(value(payload, "mediaType", "0"));
        if (mediaType != 0 && mediaType != 1) throw new IllegalArgumentException("目前仅支持图片或音频答案");
        String questionId = required(payload, "questionId");
        String extension = normalizeExtension(value(payload, "ext", ""), mediaType);
        String answerUuid = value(payload, "uuid", UUID.randomUUID().toString());
        String bitId = value(payload, "bitId", String.valueOf(System.currentTimeMillis()).substring(6));
        String objectKey = "squirrel/android/worldwide/" + System.currentTimeMillis() + "0/"
                + UUID.randomUUID() + "." + extension;
        String contentType = value(payload, "contentType", mediaType == 0 ? "image/jpeg" : "audio/mpeg");

        String encoded = required(payload, "base64");
        int comma = encoded.indexOf(',');
        if (encoded.startsWith("data:") && comma >= 0) encoded = encoded.substring(comma + 1);
        byte[] content = Base64.decode(encoded, Base64.DEFAULT);
        if (content.length == 0) throw new IllegalArgumentException("上传文件为空");

        String salt = String.valueOf(System.currentTimeMillis());
        Map<String, String> credentialForm = params(
                "retry", "0",
                "salt", salt,
                "key", md5Hex("0" + salt + SECRET_KEY));
        JSONObject credentials = requireBusiness(
                request(BASE_URL + "/ws/common/uploadController/getParams", "POST", credentialForm, null),
                "获取OSS凭证");
        for (String field : new String[]{"AccessKeyId", "AccessKeySecret", "SecurityToken"}) {
            if (credentials.optString(field, "").isEmpty()) throw new IllegalStateException("获取OSS凭证缺少 " + field);
        }

        putOss(
                objectKey,
                content,
                contentType,
                credentials.getString("AccessKeyId"),
                credentials.getString("AccessKeySecret"),
                credentials.getString("SecurityToken"));

        String publicUrl = OSS_PUBLIC_BASE + objectKey;
        ApiResponse saved = postSigned("/ws/teacher/homeworkCard/saveSubjectivesCardAnswer", params(
                "questionId", questionId,
                "quesNum", value(payload, "quesNum", ""),
                "picturUrl", publicUrl,
                "uuid", answerUuid,
                "studentId", value(payload, "studentId", requireSession("studentId")),
                "homeworkId", required(payload, "homeworkId"),
                "unitId", value(payload, "unitId", requireSession("unitId")),
                "modifyNum", value(payload, "modifyNum", "0"),
                "pictureStatus", String.valueOf(mediaType)));
        JSONObject savedData = requireBusiness(saved, "登记作业媒体答案");
        JSONObject registration = findRegistration(savedData);
        String studentAnswerId = firstNonEmpty(
                registration.optString("studentAnswerId", ""),
                registration.optString("answerId", ""));
        if (studentAnswerId.isEmpty()) throw new IllegalStateException("登记作业媒体答案成功但缺少 studentAnswerId");

        JSONObject result = new JSONObject()
                .put("url", publicUrl)
                .put("key", objectKey)
                .put("uuid", firstNonEmpty(registration.optString("uuid", ""), answerUuid))
                .put("questionId", firstNonEmpty(registration.optString("questionId", ""), questionId))
                .put("studentAnswerId", studentAnswerId)
                .put("answerType", mediaType)
                .put("bitId", bitId)
                .put("quesNum", value(payload, "quesNum", registration.optString("quesNum", "")))
                .put("durationTime", value(payload, "durationTime", ""));
        return ok(result);
    }

    private JSONObject startHomeworkMediaUpload(JSONObject payload) throws Exception {
        clearExpiredUploads();
        String uploadId = required(payload, "uploadId");
        int expectedLength = payload.optInt("expectedLength", 0);
        if (expectedLength <= 0 || expectedLength > MAX_UPLOAD_BASE64_LENGTH) {
            throw new IllegalArgumentException("上传文件大小无效");
        }

        JSONObject metadata = new JSONObject(payload.toString());
        metadata.remove("uploadId");
        metadata.remove("expectedLength");
        pendingUploads.put(uploadId, new PendingUpload(metadata, expectedLength));
        return ok(new JSONObject().put("uploadId", uploadId));
    }

    private JSONObject appendHomeworkMediaChunk(JSONObject payload) throws Exception {
        String uploadId = required(payload, "uploadId");
        PendingUpload upload = pendingUploads.get(uploadId);
        if (upload == null) throw new IllegalStateException("上传任务不存在或已过期");

        String chunk = required(payload, "chunk");
        if (upload.buffer.length() + chunk.length() > upload.expectedLength) {
            pendingUploads.remove(uploadId);
            throw new IllegalArgumentException("上传分块长度超出预期");
        }
        upload.buffer.append(chunk);
        return ok(new JSONObject()
                .put("received", upload.buffer.length())
                .put("expected", upload.expectedLength));
    }

    private JSONObject finishHomeworkMediaUpload(JSONObject payload) throws Exception {
        String uploadId = required(payload, "uploadId");
        PendingUpload upload = pendingUploads.remove(uploadId);
        if (upload == null) throw new IllegalStateException("上传任务不存在或已过期");
        if (upload.buffer.length() != upload.expectedLength) {
            throw new IllegalStateException("上传文件接收不完整");
        }

        upload.metadata.put("base64", upload.buffer.toString());
        return uploadHomeworkMedia(upload.metadata);
    }

    private void clearExpiredUploads() {
        long cutoff = System.currentTimeMillis() - PENDING_UPLOAD_TTL_MS;
        pendingUploads.entrySet().removeIf(entry -> entry.getValue().createdAt < cutoff);
    }

    private void putOss(
            String objectKey,
            byte[] content,
            String contentType,
            String accessKeyId,
            String accessKeySecret,
            String securityToken) throws Exception {
        String contentMd5 = Base64.encodeToString(MessageDigest.getInstance("MD5").digest(content), Base64.NO_WRAP);
        SimpleDateFormat formatter = new SimpleDateFormat("EEE, dd MMM yyyy HH:mm:ss 'GMT'", Locale.US);
        formatter.setTimeZone(TimeZone.getTimeZone("GMT"));
        String date = formatter.format(new Date());
        String resource = "/" + OSS_BUCKET + "/" + objectKey;
        String stringToSign = "PUT\n" + contentMd5 + "\n" + contentType + "\n" + date
                + "\nx-oss-security-token:" + securityToken + "\n" + resource;

        Mac hmac = Mac.getInstance("HmacSHA1");
        hmac.init(new SecretKeySpec(accessKeySecret.getBytes(StandardCharsets.UTF_8), "HmacSHA1"));
        String signature = Base64.encodeToString(
                hmac.doFinal(stringToSign.getBytes(StandardCharsets.UTF_8)),
                Base64.NO_WRAP);

        HttpURLConnection connection = (HttpURLConnection) new URL(
                "https://" + OSS_BUCKET + "." + OSS_ENDPOINT + "/" + encodePath(objectKey)).openConnection();
        connection.setConnectTimeout(20000);
        connection.setReadTimeout(60000);
        connection.setRequestMethod("PUT");
        connection.setDoOutput(true);
        connection.setFixedLengthStreamingMode(content.length);
        connection.setRequestProperty("Content-Type", contentType);
        connection.setRequestProperty("Content-MD5", contentMd5);
        connection.setRequestProperty("Date", date);
        connection.setRequestProperty("Authorization", "OSS " + accessKeyId + ":" + signature);
        connection.setRequestProperty("x-oss-security-token", securityToken);
        try (OutputStream output = connection.getOutputStream()) {
            output.write(content);
        }
        int status = connection.getResponseCode();
        String raw = readResponse(connection, status);
        connection.disconnect();
        if (status < 200 || status >= 300) {
            throw new IllegalStateException("OSS上传失败 HTTP " + status + ": " + raw.replaceAll("\\s+", " "));
        }
    }

    private ApiResponse postSigned(String path, Map<String, String> values) throws Exception {
        String sign = requireSession("sessionSign");
        String salt = String.valueOf(System.currentTimeMillis());
        Map<String, String> form = new LinkedHashMap<>(values);
        form.put("salt", salt);
        form.put("sign", sign);
        form.put("key", buildKey(values, salt, sign));
        return request(BASE_URL + path, "POST", form, null);
    }

    private ApiResponse request(
            String url,
            String method,
            Map<String, String> form,
            Map<String, String> headers) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        connection.setConnectTimeout(20000);
        connection.setReadTimeout(60000);
        connection.setRequestMethod(method);
        connection.setInstanceFollowRedirects(true);
        connection.setRequestProperty("User-Agent", USER_AGENT);
        connection.setRequestProperty("Accept-Encoding", "gzip");
        if (headers != null) {
            for (Map.Entry<String, String> entry : headers.entrySet()) {
                connection.setRequestProperty(entry.getKey(), entry.getValue());
            }
        }
        if (form != null && !"GET".equals(method)) {
            byte[] body = encodeForm(form).getBytes(StandardCharsets.UTF_8);
            connection.setDoOutput(true);
            connection.setFixedLengthStreamingMode(body.length);
            connection.setRequestProperty("Content-Type", "application/x-www-form-urlencoded");
            try (OutputStream output = connection.getOutputStream()) {
                output.write(body);
            }
        }
        int status = connection.getResponseCode();
        String raw = readResponse(connection, status);
        connection.disconnect();
        return new ApiResponse(status, raw, parseJson(raw));
    }

    private static String readResponse(HttpURLConnection connection, int status) throws Exception {
        InputStream source = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
        if (source == null) return "";
        if ("gzip".equalsIgnoreCase(connection.getContentEncoding())) source = new GZIPInputStream(source);
        try (InputStream input = source; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int read;
            while ((read = input.read(buffer)) >= 0) output.write(buffer, 0, read);
            return output.toString(StandardCharsets.UTF_8.name());
        }
    }

    private JSONObject wrap(ApiResponse response) throws Exception {
        if (response.status != 200) return failure(500, "HTTP " + response.status);
        return new JSONObject()
                .put("code", 200)
                .put("data", response.data == null ? JSONObject.NULL : response.data)
                .put("raw", response.raw);
    }

    private static JSONObject ok(Object data) throws Exception {
        JSONObject result = new JSONObject().put("code", 200);
        if (data != null) result.put("data", data);
        return result;
    }

    private static JSONObject failure(int code, String message) throws Exception {
        return new JSONObject().put("code", code).put("msg", message == null ? "请求失败" : message);
    }

    private static JSONObject requireBusiness(ApiResponse response, String action) throws Exception {
        if (response.status != 200) throw new IllegalStateException(action + " HTTP " + response.status);
        if (!(response.data instanceof JSONObject)) throw new IllegalStateException(action + "响应异常");
        JSONObject data = (JSONObject) response.data;
        String code = data.optString("code", "");
        if (!code.isEmpty() && !"10000".equals(code)) {
            throw new IllegalStateException(firstNonEmpty(
                    data.optString("message", ""),
                    data.optString("msg", ""),
                    action + " code=" + code));
        }
        return data;
    }

    private String requireSession(String key) {
        String result = sessionValue(key);
        if (result.isEmpty()) throw new IllegalStateException("缺少登录会话字段: " + key);
        return result;
    }

    private String sessionValue(String key) {
        return session.optString(key, "");
    }

    private static String required(JSONObject payload, String key) {
        String result = value(payload, key, "");
        if (result.isEmpty()) throw new IllegalArgumentException("缺少参数: " + key);
        return result;
    }

    private static String value(JSONObject payload, String key, String fallback) {
        if (payload != null && payload.has(key) && !payload.isNull(key)) {
            Object raw = payload.opt(key);
            return raw == null ? fallback : String.valueOf(raw);
        }
        return fallback == null ? "" : fallback;
    }

    private static Map<String, String> params(Object... entries) {
        Map<String, String> result = new LinkedHashMap<>();
        for (int index = 0; index + 1 < entries.length; index += 2) {
            Object value = entries[index + 1];
            result.put(String.valueOf(entries[index]), value == null ? "" : String.valueOf(value));
        }
        return result;
    }

    private static String buildKey(Map<String, String> values, String salt, String sign) throws Exception {
        StringBuilder source = new StringBuilder();
        for (String value : new TreeMap<>(values).values()) source.append(value == null ? "" : value);
        source.append(salt).append(sign).append(SECRET_KEY);
        return md5Hex(source.toString());
    }

    private static String md5Hex(String source) throws Exception {
        byte[] digest = MessageDigest.getInstance("MD5").digest(source.getBytes(StandardCharsets.UTF_8));
        StringBuilder result = new StringBuilder(digest.length * 2);
        for (byte value : digest) result.append(String.format(Locale.ROOT, "%02x", value & 0xff));
        return result.toString();
    }

    private static String decodeServerSign(String encoded) throws Exception {
        byte[] keyBytes = Base64.decode(PUBLIC_KEY64, Base64.DEFAULT);
        PublicKey publicKey = KeyFactory.getInstance("RSA").generatePublic(new X509EncodedKeySpec(keyBytes));
        Cipher cipher = Cipher.getInstance("RSA/ECB/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, publicKey);
        byte[] block = cipher.doFinal(Base64.decode(encoded.replaceAll("\\s+", ""), Base64.DEFAULT));
        if (block.length < 11 || block[0] != 0 || (block[1] != 1 && block[1] != 2)) {
            throw new IllegalStateException("serverSign RSA 数据无效");
        }
        int separator = 2;
        while (separator < block.length && block[separator] != 0) separator++;
        if (separator >= block.length) throw new IllegalStateException("serverSign padding 无效");
        String plaintext = new String(block, separator + 1, block.length - separator - 1, StandardCharsets.UTF_8);
        String[] parts = plaintext.split(":");
        if (parts.length < 2) throw new IllegalStateException("serverSign 内容无效");
        return parts[1] + parts[0];
    }

    private static String encodeForm(Map<String, String> values) throws Exception {
        StringBuilder result = new StringBuilder();
        for (Map.Entry<String, String> entry : values.entrySet()) {
            if (result.length() > 0) result.append('&');
            result.append(URLEncoder.encode(entry.getKey(), StandardCharsets.UTF_8.name()));
            result.append('=');
            result.append(URLEncoder.encode(entry.getValue() == null ? "" : entry.getValue(), StandardCharsets.UTF_8.name()));
        }
        return result.toString();
    }

    private static String encodePath(String path) throws Exception {
        String[] parts = path.split("/");
        StringBuilder result = new StringBuilder();
        for (int index = 0; index < parts.length; index++) {
            if (index > 0) result.append('/');
            result.append(URLEncoder.encode(parts[index], StandardCharsets.UTF_8.name()).replace("+", "%20"));
        }
        return result.toString();
    }

    private static Object parseJson(String raw) {
        if (raw == null) return null;
        String value = raw.trim();
        try {
            if (value.startsWith("{")) return new JSONObject(value);
            if (value.startsWith("[")) return new JSONArray(value);
        } catch (Exception ignored) {
        }
        return raw;
    }

    private static JSONObject parseObject(String raw) {
        try {
            return raw == null || raw.isEmpty() ? null : new JSONObject(raw);
        } catch (Exception ignored) {
            return null;
        }
    }

    private static String firstNonEmpty(String... values) {
        for (String value : values) if (value != null && !value.isEmpty()) return value;
        return "";
    }

    private static String normalizeExtension(String extension, int mediaType) {
        String value = extension == null ? "" : extension.toLowerCase(Locale.ROOT).replaceFirst("^\\.", "");
        if (mediaType == 0) return "jpg";
        if (value.matches("mp3|m4a|aac|wav|ogg|webm")) return value;
        return "mp3";
    }

    private static JSONObject findRegistration(JSONObject data) {
        for (String key : new String[]{"data", "result", "object", "InfoMap"}) {
            Object candidate = data.opt(key);
            if (candidate instanceof JSONObject && hasRegistrationField((JSONObject) candidate)) {
                return (JSONObject) candidate;
            }
        }
        return data;
    }

    private static boolean hasRegistrationField(JSONObject value) {
        return value.has("studentAnswerId") || value.has("answerId")
                || value.has("uuid") || value.has("questionId");
    }

    private static final class ApiResponse {
        final int status;
        final String raw;
        final Object data;

        ApiResponse(int status, String raw, Object data) {
            this.status = status;
            this.raw = raw;
            this.data = data;
        }
    }

    private static final class PendingUpload {
        final JSONObject metadata;
        final int expectedLength;
        final long createdAt = System.currentTimeMillis();
        final StringBuilder buffer;

        PendingUpload(JSONObject metadata, int expectedLength) {
            this.metadata = metadata;
            this.expectedLength = expectedLength;
            this.buffer = new StringBuilder(expectedLength);
        }
    }
}
