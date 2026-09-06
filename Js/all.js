/* --- Window Load & Preloader Elimination --- */
window.addEventListener('load', () => {
    setTimeout(() => {
        const loader = document.getElementById('loadingScreen');
        if(loader) {
            loader.style.opacity = '0';
            setTimeout(() => loader.style.display = 'none', 500);
        }
    }, 400);
});