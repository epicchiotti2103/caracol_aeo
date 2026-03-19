document.addEventListener('DOMContentLoaded', () => {
  
  // Configuração do Observer para Scroll Reveal
  const observerOptions = {
    root: null, // usa a viewport do navegador
    rootMargin: '0px',
    threshold: 0.15 // Dispara quando 15% do elemento estiver visível
  };

  const observer = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        // Adiciona a classe que dispara a animação CSS
        entry.target.classList.add('active');
        // Opcional: Desobserva o elemento após animar (ocorre apenas 1x)
        observer.unobserve(entry.target);
      }
    });
  }, observerOptions);

  // Seleciona todos os elementos com a classe .reveal e inicia a observação
  const revealElements = document.querySelectorAll('.reveal');
  revealElements.forEach(el => observer.observe(el));

  // Navbar - Muda estilo ao rolar a página
  const header = document.querySelector('header nav');
  window.addEventListener('scroll', () => {
    if (window.scrollY > 50) {
      header.style.background = 'rgba(5, 5, 8, 0.9)';
      header.style.boxShadow = '0 10px 30px rgba(0,0,0,0.5)';
    } else {
      header.style.background = 'rgba(5, 5, 8, 0.7)';
      header.style.boxShadow = 'none';
    }
  });

});