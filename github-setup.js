// GitHub Token Setup - Sitenin ilk yüklenmesinde çalışır
(function() {
    // Eğer token yoksa varsayılan admin token'ı kullan
    if (!localStorage.getItem('github_token')) {
        // Admin, ilk kurulumda bu dosyayı düzenleyip kendi token'ını buraya yazabilir
        const ADMIN_TOKEN = 'YOUR_GITHUB_TOKEN_HERE';
        if (ADMIN_TOKEN !== 'YOUR_GITHUB_TOKEN_HERE') {
            localStorage.setItem('github_token', ADMIN_TOKEN);
            console.log('GitHub token configured from setup file');
        }
    }
})();
