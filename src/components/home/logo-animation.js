// Esta animación no depende de Firebase ni de módulos externos. Así el logo
// sigue funcionando incluso si la autenticación tarda en cargar o falla.
(() => {
    const logoWord = document.querySelector("[data-logo-word]");
    if (!logoWord) return;

    const words = ["PRO", "IA", "SANTOTO"];
    let wordIndex = 0;
    let characterIndex = words[wordIndex].length;
    let isDeleting = true;

    function animate() {
        const currentWord = words[wordIndex];
        let delay = 120;

        if (isDeleting) {
            characterIndex -= 1;
            logoWord.textContent = currentWord.slice(0, characterIndex);
            delay = 100;

            if (characterIndex === 0) {
                wordIndex = (wordIndex + 1) % words.length;
                isDeleting = false;
                delay = 350;
            }
        } else {
            characterIndex += 1;
            logoWord.textContent = words[wordIndex].slice(0, characterIndex);

            if (characterIndex === words[wordIndex].length) {
                isDeleting = true;
                delay = 3000;
            }
        }

        window.setTimeout(animate, delay);
    }

    window.setTimeout(animate, 1600);
})();
