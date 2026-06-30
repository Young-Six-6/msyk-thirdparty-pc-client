window.Theme?.initTheme();

const $ = (s) => document.querySelector(s);

(async () => {

    const appName = "没师有课";
    const appVersion = "v1.0.2";

    $("#appName").textContent = appName;
    $("#appVersion").textContent = appVersion;

    $("#platform").textContent = navigator.platform;

})();

$("#backBtn")?.addEventListener("click", () => {

    if (history.length > 1) {
        history.back();
    } else {
        location.href = "../me/index.html";
    }

});

//$("#logout")?.addEventListener("click", async () => {
//
//    await window.electronAPI.apiLogout();
//
//    location.href = "../login/index.html";
//
//});

$("#checkUpdate")?.addEventListener("click", () => {

    alert("https://github.com/Young-Six-6/msyk-thirdparty-pc-client");

});