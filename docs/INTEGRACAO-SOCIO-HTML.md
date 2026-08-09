# Integração com socio.html

Adicionar, no final do `<body>` e antes do `</body>`:

```html
<script src="js/admin-enhancements.js"></script>
```

Não é necessário alterar o CSS.

Exemplos de utilização:

```js
await NAFAdmin.assertAdmin();

const socios = await NAFAdmin.listSocios();

await NAFAdmin.sendQuotasEmAtraso([socioId]);

await NAFAdmin.sendDocumentoTodos(file);

await NAFAdmin.importarPDF(pdfFile);

await NAFAdmin.retirarPontos(socioId, 10, "Penalização administrativa");
```
