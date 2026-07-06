import html2canvas from 'html2canvas'

export async function exportElementAsJpg(elementRef, filename) {
  if (!elementRef.current) return

  const canvas = await html2canvas(elementRef.current, {
    scale: 2,
    backgroundColor: '#ffffff',
    onclone: (clonedDoc, clonedElement) => {
      // Sembunyikan tombol yang tidak perlu ikut ke JPG
      clonedElement.querySelectorAll('.no-export').forEach((el) => {
        el.style.display = 'none'
      })

      // Ganti semua <input> jadi teks biasa <span>, supaya karakternya
      // ter-render dengan benar saat di-screenshot (html2canvas tidak
      // bisa membaca isi <input> dengan akurat)
      clonedElement.querySelectorAll('input').forEach((input) => {
        const span = clonedDoc.createElement('span')
        span.textContent = input.value || ''
        span.className = input.className
        span.style.display = 'block'
        span.style.width = '100%'
        input.replaceWith(span)
      })
    },
  })

  const link = document.createElement('a')
  link.download = `${filename}.jpg`
  link.href = canvas.toDataURL('image/jpeg', 0.95)
  link.click()
}
