package com.youngsix.msyk;

import org.json.JSONObject;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

final class NativeApiBridge {
    interface Reply {
        void send(String message);
    }

    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final MsykApiClient apiClient;

    NativeApiBridge(MsykApiClient apiClient) {
        this.apiClient = apiClient;
    }

    void handle(String message, Reply reply) {
        executor.execute(() -> {
            String id = "";
            try {
                JSONObject request = new JSONObject(message);
                id = request.optString("id", "");
                String method = request.optString("method", "");
                JSONObject payload = request.optJSONObject("payload");
                if (payload == null) payload = new JSONObject();

                Object result = apiClient.invoke(method, payload);
                JSONObject response = new JSONObject();
                response.put("id", id);
                response.put("result", result == null ? JSONObject.NULL : result);
                reply.send(response.toString());
            } catch (Exception error) {
                try {
                    JSONObject failure = new JSONObject();
                    failure.put("id", id);
                    failure.put("result", new JSONObject()
                            .put("code", 500)
                            .put("msg", error.getMessage() == null ? error.toString() : error.getMessage()));
                    reply.send(failure.toString());
                } catch (Exception ignored) {
                    reply.send("{\"id\":\"\",\"result\":{\"code\":500,\"msg\":\"Native bridge error\"}}");
                }
            }
        });
    }

    void close() {
        executor.shutdownNow();
    }
}
