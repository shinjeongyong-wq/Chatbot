(function () {
    const isLocal = window.location.hostname === 'localhost'
        || window.location.hostname === '127.0.0.1'
        || window.location.hostname.includes('192.168.');

    const isStaging = window.location.hostname.includes('staging')
        || window.location.hostname.includes('-git-staging-');

    const isFeature = window.location.hostname.includes('-git-feature-');

    if (!isLocal && !isStaging && !isFeature) {
        console.log = () => { };
        console.debug = () => { };
        console.info = () => { };
        console.warn = () => { };
    }
})();
