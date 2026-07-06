import html2canvas from 'html2canvas'

export async function exportElementAsJpg(elementRef, filename) {
  if (!elementRef.current) return
  const canvas = await html2canvas(elementRef.current, {
    scale: 2,
    backgroundColor: '#ffffff',
    onclone: (clonedDoc) => {
      clonedDoc.querySelectorAll('.no-export').forEach((el) => {
        el.style.display = 'none'
      })
    },
  })
  const link = document.createElement('a')
  link.download = `${filename}.jpg`
  link.href = canvas.toDataURL('image/jpeg', 0.95)
  link.click()
}
