# Admin Modal Görünmeme Sorunu – Kök Neden ve Kalıcı Çözüm

Bu not, `admin.html` içindeki ürün düzenleme modalının bazı durumlarda tıklamayla açılmasına rağmen görünmemesi sorununu ve kalıcı çözümünü belgeler.

## Belirti

- “Düzenle” butonuna tıklanınca konsolda akış logları modalın açıldığını gösteriyor (sınıflar ekleniyor), ancak modal görünmüyor.
- Konsolda hata yok.
- Modal elementinin inline `style="display:none"` değeri, CSS’te `.modal.active { display:flex; }` kuralını ezdiği için görünürlük gerçekleşmiyor.
- Ek olarak, birden fazla olay dinleyicisi (delegasyon + global yakalayıcı veya hızlı çift tıklama) aynı anda tetiklendiğinde modal açma çağrıları peş peşe gelebiliyor.

## Kök Nedenler

1. Inline stil önceliği:
   - HTML başlangıç durumda modalı gizlemek için inline `style="display:none"` kullanıyordu.
   - `.classList.add('active')` uygulansa bile inline stil, CSS sınıf kurallarından daha yüksek önceliğe sahiptir ve görünmeyi engeller.

2. Çift tetiklenme/yarış:
   - Birden fazla click handler aynı anda tetiklenebiliyor ve modal açma fonksiyonu kısa aralıkla tekrar çağrılabiliyor.

## Çözüm Adımları

1. Görünürlüğü zorlamak:
   - `openProductEditPanel(product)` içinde `panel.classList.add('active')` sonrası
   - `panel.style.display = 'flex'` eklenerek inline stil kesin olarak görünür hale getirildi.
   - Kapatırken `closeProductEditPanel()` içinde `panel.classList.remove('active')` ve `panel.setAttribute('style', 'display:none')` ile başlangıç gizli duruma geri dönülüyor.

2. Çift açılmayı önlemek:
   - Hızlı ardışık çağrıları yutmak için zaman damgası gardı eklendi:
     - `panel.__lastOpenTs` değeri tutuluyor; `now - last < 300ms` ve panel zaten `active` ise çağrı yok sayılıyor.

## Ek Notlar

- Dağıtımdan sonra CDN/tarayıcı önbelleği eski `admin.html` sürümünü tutabilir. “Empty Cache and Hard Reload” yaparak güncel dosyaları yüklemek gerekebilir.
- Token yoksa kaydetme işlemi yerel bilgilendirme verir; token varsa GitHub API ile commit gerçekleşir ve 409 çakışmalarında otomatik yeniden deneme mekanizması devredir.

## İlgili Kod Noktaları

- Dosya: `admin.html`
  - Fonksiyon: `openProductEditPanel(product)`
    - Görünürlük garantisi: `panel.style.display = 'flex'`
    - Çift açılma gardı: `panel.__lastOpenTs` kontrolü
  - Fonksiyon: `closeProductEditPanel()`
    - Başlangıç gizlilik: `panel.setAttribute('style', 'display:none')`

Bu pratikler, modal bileşenlerinde inline stil ile sınıf tabanlı görünürlük kontrolünün çakışmasını önler ve çoklu event katmanlarından doğan hızlı çift tetiklemeleri güvenle absorbe eder.
