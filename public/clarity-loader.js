/* Microsoft Clarity — static loader for project wqtsdirx06.
 * Loaded via <head> so Clarity's setup verification can detect the installation.
 * Consent V2 is sent by analytics.ts after the app boots.
 * The script tag is marked data-engrove-clarity so analytics.ts can detect it
 * and avoid injecting a second Clarity tag.
 */
(function (c, l, a, r, i, t, y) {
  c[a] =
    c[a] ||
    function () {
      (c[a].q = c[a].q || []).push(arguments);
    };
  t = l.createElement(r);
  t.async = 1;
  t.src = 'https://www.clarity.ms/tag/' + i;
  t.setAttribute('data-engrove-clarity', 'true');
  y = l.getElementsByTagName(r)[0];
  y.parentNode.insertBefore(t, y);
})(window, document, 'clarity', 'script', 'wqtsdirx06');
