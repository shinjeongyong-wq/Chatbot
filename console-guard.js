(function () {
    const isLocal = window.location.hostname === 'localhost'
        || window.location.hostname === '127.0.0.1'
        || window.location.hostname.includes('192.168.');

    if (!isLocal) {
        console.log = () => { };
        console.debug = () => { };
        console.info = () => { };
        console.warn = () => { };
    }
})();
