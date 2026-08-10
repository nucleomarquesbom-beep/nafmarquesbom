import * as XLSX
    from "npm:xlsx";


import { createClient }
    from "npm:@supabase/supabase-js@2";


const supabase =
    createClient(
        Deno.env.get(
            "SUPABASE_URL"
        )!,
        Deno.env.get(
            "SUPABASE_SERVICE_ROLE_KEY"
        )!
    );


Deno.serve(async (req) => {

    try {

        const auth =
            req.headers.get(
                "Authorization"
            );


        if (!auth) {

            return Response.json(
                {
                    error:
                        "Não autenticado."
                },
                {
                    status: 401
                }
            );
        }


        const token =
            auth.replace(
                "Bearer ",
                ""
            );


        const {
            data: {
                user
            }
        } =
            await supabase.auth
                .getUser(token);


        if (!user) {

            return Response.json(
                {
                    error:
                        "Sessão inválida."
                },
                {
                    status: 401
                }
            );
        }


        /*
         * IMPORTANTE:
         * aqui devemos verificar se o utilizador
         * é administrador.
         */


        const form =
            await req.formData();


        const file =
            form.get("excel");


        if (!(file instanceof File)) {

            return Response.json(
                {
                    error:
                        "Ficheiro Excel inválido."
                },
                {
                    status: 400
                }
            );
        }


        const buffer =
            await file.arrayBuffer();


        const workbook =
            XLSX.read(
                new Uint8Array(buffer),
                {
                    type: "array"
                }
            );


        const sheetName =
            workbook.SheetNames[0];


        const sheet =
            workbook.Sheets[
                sheetName
            ];


        const rows =
            XLSX.utils.sheet_to_json(
                sheet,
                {
                    defval: ""
                }
            );


        let importados = 0;
        let ignorados = 0;


        for (const row of rows) {

            const numeroSocio =
                Number(
                    row["Nº Sócio"] ??
                    row["Numero"] ??
                    row["Número"] ??
                    row["numero_socio"]
                );


            const ano =
                Number(
                    row["Ano"] ??
                    row["ano"]
                );


            const mes =
                Number(
                    row["Mês"] ??
                    row["Mes"] ??
                    row["mes"]
                );


            const estadoTexto =
                String(
                    row["Estado"] ??
                    row["estado"] ??
                    ""
                )
                .toLowerCase()
                .trim();


            if (
                !numeroSocio ||
                !ano ||
                !mes ||
                mes < 1 ||
                mes > 12
            ) {

                ignorados++;

                continue;
            }


            const {
                data: socio
            } =
                await supabase
                    .from("socios")
                    .select("id")
                    .eq(
                        "numero_socio",
                        numeroSocio
                    )
                    .single();


            if (!socio) {

                ignorados++;

                continue;
            }


            const estado =
                estadoTexto.includes(
                    "pago"
                )
                    ? "paga"
                    : "em_atraso";


            const {
                error
            } =
                await supabase
                    .from("quotas")
                    .upsert(
                        {
                            socio_id:
                                socio.id,

                            ano,

                            mes,

                            valor: 1,

                            estado
                        },
                        {
                            onConflict:
                                "socio_id,ano,mes"
                        }
                    );


            if (error) {
                throw error;
            }


            importados++;
        }


        return Response.json({

            success: true,

            message:
                `Importação concluída. ${importados} registos atualizados e ${ignorados} ignorados.`,

            importados,

            ignorados
        });


    } catch (error) {

        console.error(error);

        return Response.json(
            {
                error:
                    "Erro ao importar o Excel."
            },
            {
                status: 500
            }
        );
    }

});
