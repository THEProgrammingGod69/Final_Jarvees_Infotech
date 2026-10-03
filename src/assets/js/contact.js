/**
 * Enquiry form: inline validation, then a hand-off to WhatsApp or the
 * visitor's email app with the message pre-filled. No backend required,
 * and the website never stores what the visitor types.
 */
(() => {
  'use strict';

  const doc = document;

  function init() {
    const form = doc.querySelector('[data-enquiry-form]');
    if (!form) return;

    const whatsapp = form.dataset.whatsapp;
    const email = form.dataset.email;
    const status = form.querySelector('[data-form-status]');
    const statusTitle = form.querySelector('[data-status-title]');
    const statusText = form.querySelector('[data-status-text]');
    const statusLink = form.querySelector('[data-status-link]');

    const fields = {
      name: form.elements.namedItem('name'),
      phone: form.elements.namedItem('phone'),
      email: form.elements.namedItem('email'),
      interest: form.elements.namedItem('interest'),
    };

    // Pre-select the topic when arriving from a course or service link (?interest=id).
    const wanted = new URLSearchParams(location.search).get('interest');
    if (wanted && Array.from(fields.interest.options).some((o) => o.value === wanted && !o.disabled)) {
      fields.interest.value = wanted;
    }

    const rules = {
      name: (v) => v.trim().length >= 2 || 'Please enter your name.',
      phone: (v) => {
        const digits = v.replace(/\D/g, '');
        return (digits.length >= 10 && digits.length <= 13) || 'Please enter a valid phone number with at least 10 digits.';
      },
      email: (v) => !v.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) || 'Please enter a valid email address, or leave it blank.',
      interest: (v) => Boolean(v) || 'Please choose a course or service.',
    };

    const validate = (name) => {
      const input = fields[name];
      const result = rules[name](input.value);
      const message = result === true ? '' : result;
      input.setAttribute('aria-invalid', message ? 'true' : 'false');
      const error = doc.getElementById(`${input.id}-error`);
      if (error) error.textContent = message;
      return !message;
    };

    for (const name of Object.keys(rules)) {
      const input = fields[name];
      const recheck = () => input.getAttribute('aria-invalid') === 'true' && validate(name);
      input.addEventListener('input', recheck);
      input.addEventListener('change', recheck);
      input.addEventListener('blur', () => input.value && validate(name));
    }

    const showStatus = (title, text, href) => {
      statusTitle.textContent = title;
      statusText.textContent = text;
      if (statusLink) statusLink.href = href;
      status.classList.remove('is-visible');
      void status.offsetWidth; // restart the entrance animation
      status.classList.add('is-visible');
      status.focus({ preventScroll: true });
      status.scrollIntoView({ behavior: window.Jarvees?.motionOK ? 'smooth' : 'auto', block: 'nearest' });
    };

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const invalid = Object.keys(rules).filter((name) => !validate(name));
      if (invalid.length) {
        status.classList.remove('is-visible');
        fields[invalid[0]].focus();
        return;
      }

      const data = new FormData(form);
      const value = (key) => String(data.get(key) || '').trim();
      const topic = fields.interest.selectedOptions[0]?.textContent.trim() || value('interest');
      const body = [
        `Hello Jarvees, I'm ${value('name')}.`,
        `Interested in: ${topic}`,
        `Preferred mode: ${value('mode') || 'Not sure yet'}`,
        `Phone: ${value('phone')}`,
        value('email') && `Email: ${value('email')}`,
        value('message') && `\n${value('message')}`,
      ]
        .filter(Boolean)
        .join('\n');

      if (e.submitter?.value === 'email') {
        const href = `mailto:${email}?subject=${encodeURIComponent(`Website enquiry: ${topic}`)}&body=${encodeURIComponent(body)}`;
        window.location.href = href;
        showStatus('Almost done!', 'Your email app should now be open with the message ready. Press send there and we will reply soon.', href);
        return;
      }

      const href = `https://wa.me/${whatsapp}?text=${encodeURIComponent(body)}`;
      const tab = window.open(href, '_blank');
      if (tab) tab.opener = null;
      else window.location.href = href; // pop-up blocked: continue in this tab
      showStatus('Almost done!', "We've opened WhatsApp with your message ready. Tap send there and our team will reply shortly.", href);
    });
  }

  if (doc.prerendering) doc.addEventListener('prerenderingchange', init, { once: true });
  else init();
})();
