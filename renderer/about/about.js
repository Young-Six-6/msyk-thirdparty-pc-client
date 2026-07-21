window.Theme?.initTheme();

const $ = (s) => document.querySelector(s);

(async () => {

    const appName = "没师有课";
    const appVersion = "v1.3.0";

    $("#appName").textContent = appName;
    $("#appVersion").textContent = appVersion;

    $("#platform").textContent = navigator.platform;

})();

$("#backBtn")?.addEventListener("click", () => {
    location.replace("../main/index.html?page=me");
});

$("#checkUpdate")?.addEventListener("click", async () => {
    const button = $("#checkUpdate");
    const label = button?.querySelector("span");
    const releaseUrl = "https://github.com/Young-Six-6/msyk-thirdparty-pc-client/releases/latest";
    const originalText = label?.textContent || "检查更新";

    if (button) button.disabled = true;
    if (label) label.textContent = "正在打开...";

    try {
        if (typeof window.msykAPI?.openExternal === "function") {
            const response = await window.msykAPI.openExternal(releaseUrl);
            if (!response || response.code !== 200) {
                throw new Error(response?.msg || "无法打开浏览器");
            }
            return;
        }

        const opened = window.open(releaseUrl, "_blank", "noopener,noreferrer");
        if (!opened) location.href = releaseUrl;
    } catch (error) {
        alert(`打开更新页面失败：${error?.message || error}`);
    } finally {
        if (button) button.disabled = false;
        if (label) label.textContent = originalText;
    }
});
