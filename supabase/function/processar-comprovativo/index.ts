import { createClient } from "npm:@supabase/supabase-js@2";

const supabaseUrl =
    Deno.env.get("SUPABASE_URL")!;

const supabaseSecret =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabaseAdmin =
    createClient(
        supabaseUrl,
        supabaseSecret
    );


Deno.serve(async (req) => {

    try {

        if (req.method !== "POST") {

            return new Response(
                JSON.stringify({
                    error: "Método não permitido."
                }),
                {
                    status: 405,
                    headers: {
                        "Content-Type":
                            "application/json"
                    }
                }
            );
        }


        /*
         * 1. AUTENTICAR SÓCIO
         */

        const auth =
            req.headers.get("Authorization");

        if (!auth) {

            return new Response(
                JSON.stringify({
                    error: "Não autenticado."
                }),
                {
                    status: 401,
                    headers: {
                        "Content-Type":
                            "application/json"
                    }
                }
            );
        }


        const token =
            auth.replace("Bearer ", "");


        const {
            data: {
                user
            },
            error: authError
        } =
            await supabaseAdmin.auth.getUser(token);


        if (authError || !user) {

            return new Response(
                JSON.stringify({
                    error:
                        "Sessão inválida."
                }),
                {
                    status: 401,
                    headers: {
                        "Content-Type":
                            "application/json"
                    }
                }
            );
        }


        /*
         * 2. ENCONTRAR SÓCIO
         */

        const {
            data: socio,
            error: socioError
        } =
            await supabaseAdmin
                .from("socios")
                .select("*")
                .eq("email", user.email)
                .single();


        if (socioError || !socio) {

            return new Response(
                JSON.stringify({
                    error:
                        "Sócio não encontrado."
                }),
                {
                    status: 404,
                    headers: {
                        "Content-Type":
                            "application/json"
                    }
                }
            );
        }


        /*
         * 3. RECEBER PDF
         */

        const form =
            await req.formData();

        const file =
            form.get("comprovativo");


        if (!(file instanceof File)) {

            return new Response(
                JSON.stringify({
                    error:
                        "Comprovativo inválido."
                }),
                {
                    status: 400,
                    headers: {
                        "Content-Type":
                            "application/json"
                    }
                }
            );
        }


        if (
            file.type !==
            "application/pdf"
        ) {

            return new Response(
                JSON.stringify({
                    error:
                        "O ficheiro tem de ser PDF."
                }),
                {
                    status: 400,
                    headers: {
                        "Content-Type":
                            "application/json"
                    }
                }
            );
        }


        /*
         * 4. GUARDAR COMPROVATIVO
         */

        const fileBytes =
            new Uint8Array(
                await file.arrayBuffer()
            );


        const safeName =
            file.name
                .replace(
                    /[^a-zA-Z0-9._-]/g,
                    "_"
                );


        const path =
            `${socio.id}/${crypto.randomUUID()}-${safeName}`;


        const {
            error: uploadError
        } =
            await supabaseAdmin.storage
                .from("comprovativos")
                .upload(
                    path,
                    fileBytes,
                    {
                        contentType:
                            "application/pdf",
                        upsert: false
                    }
                );


        if (uploadError) {

            throw uploadError;
        }


        /*
         * 5. EXTRAIR TEXTO DO PDF
         *
         * Aqui entra o parser/OCR.
         */

        const texto =
            await extrairTextoPDF(
                fileBytes
            );


        /*
         * 6. ANALISAR PAGAMENTO
         */

        const pagamento =
            analisarComprovativo(
                texto
            );


        if (!pagamento.valido) {

            await supabaseAdmin
                .from("quota_pagamentos")
                .insert({
                    socio_id: socio.id,
                    valor:
                        pagamento.valor || 0,
                    anos_quota:
                        pagamento.valor
                            ? pagamento.valor / 12
                            : 0,
                    data_pagamento:
                        pagamento.data ||
                        new Date()
                            .toISOString()
                            .slice(0, 10),
                    metodo:
                        pagamento.metodo ||
                        "transferencia",
                    destinatario:
                        pagamento.destinatario ||
                        null,
                    comprovativo_path:
                        path,
                    estado: "rejeitado",
                    observacoes:
                        pagamento.motivo
                });


            return new Response(
                JSON.stringify({
                    error:
                        pagamento.motivo ||
                        "Comprovativo não validado."
                }),
                {
                    status: 422,
                    headers: {
                        "Content-Type":
                            "application/json"
                    }
                }
            );
        }


        /*
         * 7. REGISTAR PAGAMENTO
         */

        const meses =
            Math.floor(
                pagamento.valor
            );


        const {
            data: pagamentoCriado,
            error:
                pagamentoError
        } =
            await supabaseAdmin
                .from("quota_pagamentos")
                .insert({
                    socio_id: socio.id,

                    valor:
                        pagamento.valor,

                    anos_quota:
                        pagamento.valor / 12,

                    data_pagamento:
                        pagamento.data,

                    metodo:
                        pagamento.metodo,

                    destinatario:
                        pagamento.destinatario,

                    comprovativo_path:
                        path,

                    estado:
                        "validado"
                })
                .select()
                .single();


        if (pagamentoError) {

            throw pagamentoError;
        }


        /*
         * 8. REGULARIZAR QUOTAS
         */

        await regularizarQuotas(
            socio.id,
            pagamentoCriado.id,
            meses
        );


        /*
         * 9. GERAR RECIBO
         */

        const recibo =
            await gerarRecibo(
                socio,
                pagamentoCriado
            );


        /*
         * 10. GUARDAR RECIBO
         */

        const reciboPath =
            `${socio.id}/recibo-${recibo.numero}.pdf`;


        await supabaseAdmin.storage
            .from("recibos")
            .upload(
                reciboPath,
                recibo.pdf,
                {
                    contentType:
                        "application/pdf",
                    upsert: false
                }
            );


        /*
         * 11. ASSOCIAR RECIBO
         */

        await supabaseAdmin
            .from("quota_pagamentos")
            .update({
                recibo_path:
                    reciboPath
            })
            .eq(
                "id",
                pagamentoCriado.id
            );


        await supabaseAdmin
            .from("recibos_quotas")
            .insert({
                socio_id:
                    socio.id,

                pagamento_id:
                    pagamentoCriado.id,

                numero_recibo:
                    recibo.numero,

                valor:
                    pagamentoCriado.valor,

                pdf_path:
                    reciboPath
            });


        /*
         * 12. ENVIAR EMAIL
         */

        await enviarReciboEmail(
            socio,
            recibo.pdf,
            recibo.numero,
            pagamentoCriado.valor
        );


        return new Response(
            JSON.stringify({
                success: true,

                message:
                    `Pagamento de ${pagamentoCriado.valor.toFixed(2)} € validado. O recibo foi emitido e enviado por email.`,

                valor:
                    pagamentoCriado.valor,

                recibo:
                    recibo.numero
            }),
            {
                status: 200,
                headers: {
                    "Content-Type":
                        "application/json"
                }
            }
        );


    } catch (error) {

        console.error(error);

        return new Response(
            JSON.stringify({
                error:
                    "Erro interno ao processar o comprovativo."
            }),
            {
                status: 500,
                headers: {
                    "Content-Type":
                        "application/json"
                }
            }
        );
    }

});
