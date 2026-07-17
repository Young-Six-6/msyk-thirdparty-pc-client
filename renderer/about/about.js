window.Theme?.initTheme();

const $ = (s) => document.querySelector(s);

(async () => {

    const appName = "没师有课";
    const appVersion = "v1.2.2";

    $("#appName").textContent = appName;
    $("#appVersion").textContent = appVersion;

    $("#platform").textContent = navigator.platform;

})();

$("#backBtn")?.addEventListener("click", () => {
    location.replace("../me/index.html");
});

$("#checkUpdate")?.addEventListener("click", () => {

    alert("https://github.com/Young-Six-6/msyk-thirdparty-pc-client");

});
