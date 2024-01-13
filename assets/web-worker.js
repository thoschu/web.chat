self.addEventListener('message', (e) => {
    const superBuffer = new Blob(e.data, {type: 'video/webm'});
    const objectURL = URL.createObjectURL(superBuffer);

    self.postMessage(objectURL);
}, false);
