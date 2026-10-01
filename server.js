const express = require("express");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 8080;


/* =========================
   GEMINI
   ========================= */

const GEMINI_API_KEY =
    process.env.GEMINI_API_KEY;


const GEMINI_MODELS = [
    "gemini-3.8-flash",
    "gemini-3.7-flash",
    "gemini-3.6-flash",
    "gemini-3.5-flash-lite"
];


/* =========================
   MIDDLEWARE
   ========================= */

app.use(
    express.json({
        limit: "1mb"
    })
);


app.use(
    express.static(
        path.join(__dirname, "public")
    )
);


/* =========================
   DATA
   ========================= */

let latestData = null;

let lastUpdate = 0;


/* =========================
   ESP32 GUI DU LIEU
   ========================= */

app.post("/api/data", (req, res) => {

    latestData = req.body;

    lastUpdate = Date.now();


    console.log(
        "================================"
    );

    console.log(
        "Nhan du lieu tu ESP32:"
    );

    console.log(
        latestData
    );


    res.json({
        success: true,
        message: "Da nhan du lieu ESP32"
    });
});


/* =========================
   WEB LAY DU LIEU
   ========================= */

app.get("/api/data/latest", (req, res) => {

    const now = Date.now();

    let online = false;


    if (latestData !== null)
    {
        if (now - lastUpdate < 5000)
        {
            online = true;
        }
    }


    res.json({
        online: online,
        lastUpdate: lastUpdate,
        data: latestData
    });
});


/* =========================
   CHO MOT CHUT
   ========================= */

function sleep(ms)
{
    return new Promise(
        function(resolve)
        {
            setTimeout(
                resolve,
                ms
            );
        }
    );
}


/* =========================
   GOI GEMINI
   ========================= */

async function callGemini(
    model,
    message,
    systemInstruction
)
{
    const url =
        "https://generativelanguage.googleapis.com/v1beta/interactions";


    const response =
        await fetch(
            url,
            {
                method: "POST",

                headers: {
                    "Content-Type":
                        "application/json",

                    "x-goog-api-key":
                        GEMINI_API_KEY
                },

                body: JSON.stringify({
                    model:
                        model,

                    system_instruction:
                        systemInstruction,

                    input:
                        message,

                    generation_config: {
                        thinking_level:
                            "low"
                    }
                })
            }
        );


    const result =
        await response.json();


    return {
        response: response,
        result: result
    };
}


/* =========================
   LAY NOI DUNG GEMINI
   ========================= */

function getGeminiReply(result)
{
    if (result.output_text)
    {
        return result.output_text;
    }


    if (result.outputs)
    {
        for (const output of result.outputs)
        {
            if (output.text)
            {
                return output.text;
            }


            if (output.content)
            {
                for (const content of output.content)
                {
                    if (content.text)
                    {
                        return content.text;
                    }
                }
            }
        }
    }


    if (result.steps)
    {
        for (const step of result.steps)
        {
            if (step.content)
            {
                for (const content of step.content)
                {
                    if (content.text)
                    {
                        return content.text;
                    }
                }
            }
        }
    }


    return null;
}


/* =========================
   GEMINI CHAT
   ========================= */

app.post("/api/chat", async (req, res) => {

    try
    {
        if (!GEMINI_API_KEY)
        {
            return res.status(500).json({
                success: false,
                message:
                    "Chua cau hinh GEMINI_API_KEY"
            });
        }


        const message =
            String(
                req.body.message || ""
            ).trim();


        const userName =
            String(
                req.body.userName || "bạn"
            ).trim();


        if (message === "")
        {
            return res.status(400).json({
                success: false,
                message:
                    "Tin nhan dang trong"
            });
        }


        /* =========================
           DU LIEU CAM BIEN
           ========================= */

        let healthContext =
            "Hiện chưa có dữ liệu cảm biến.";


        if (latestData)
        {
            healthContext =
                `
Dữ liệu hiện tại từ thiết bị MentalGuard:

Stress Score:
${latestData.stressScore ?? "không có"}

Nhịp tim:
${latestData.heartRate ?? "không có"} BPM

Nhiệt độ da:
${latestData.temperature ?? "không có"} °C

Mức độ vận động:
${latestData.activity ?? "không có"}

Trạng thái đeo:
${
    latestData.wearing === true
        ? "đang đeo"
        : latestData.wearing === false
            ? "không đeo"
            : "không rõ"
}
                `;
        }


        /* =========================
           HUONG DAN AI
           ========================= */

        const systemInstruction =
            `
Bạn là MentalGuard AI.

Bạn là trợ lý trò chuyện thân thiện
trong đồ án MentalGuard của Nhóm 4.

Tên người dùng:
${userName}

Hãy luôn trả lời bằng tiếng Việt.

Cách trò chuyện:
- Tự nhiên.
- Thân thiện.
- Ngắn gọn.
- Dễ hiểu.
- Biết lắng nghe.
- Không trả lời quá máy móc.
- Có thể gọi tên người dùng khi phù hợp.
- Nếu người dùng đang tâm sự,
  hãy phản hồi như một người đang lắng nghe.
- Không biến mọi câu trả lời thành danh sách.
- Không tự ý chẩn đoán bệnh.
- Không xem Stress Score là chẩn đoán y khoa.
- Chỉ tham khảo dữ liệu cảm biến
  khi dữ liệu thực sự liên quan.

${healthContext}
            `;


        /* =========================
           THU CAC MODEL
           ========================= */

        let lastError = null;


        for (const model of GEMINI_MODELS)
        {
            console.log(
                "Dang thu Gemini:",
                model
            );


            /*
             * Thu toi da 2 lan moi model.
             */

            for (
                let attempt = 1;
                attempt <= 2;
                attempt++
            )
            {
                try
                {
                    const gemini =
                        await callGemini(
                            model,
                            message,
                            systemInstruction
                        );


                    const response =
                        gemini.response;


                    const result =
                        gemini.result;


                    /*
                     * THANH CONG
                     */

                    if (response.ok)
                    {
                        const reply =
                            getGeminiReply(
                                result
                            );


                        if (reply)
                        {
                            console.log(
                                "Gemini thanh cong:",
                                model
                            );


                            return res.json({
                                success: true,
                                reply: reply,
                                model: model
                            });
                        }


                        console.log(
                            "Model khong tra noi dung:",
                            model
                        );


                        lastError =
                            "Gemini khong tra ve noi dung";


                        break;
                    }


                    /*
                     * LOI TAM THOI
                     * 429 = qua nhieu request
                     * 503 = server dang qua tai
                     */

                    if (
                        response.status === 429 ||
                        response.status === 503
                    )
                    {
                        console.log(
                            model,
                            "dang ban / qua tai.",
                            "Lan thu:",
                            attempt
                        );


                        lastError =
                            result?.error?.message ||
                            "Gemini dang ban";


                        if (attempt < 2)
                        {
                            await sleep(
                                1200
                            );

                            continue;
                        }


                        break;
                    }


                    /*
                     * MODEL KHONG DUNG DUOC
                     */

                    if (
                        response.status === 404 ||
                        response.status === 400
                    )
                    {
                        console.log(
                            "Khong dung duoc model:",
                            model
                        );


                        console.log(
                            result?.error?.message
                        );


                        lastError =
                            result?.error?.message ||
                            "Model khong dung duoc";


                        break;
                    }


                    /*
                     * LOI KHAC
                     */

                    console.log(
                        "GEMINI ERROR:",
                        model,
                        result
                    );


                    lastError =
                        result?.error?.message ||
                        "Gemini API loi";


                    break;
                }

                catch (error)
                {
                    console.log(
                        "Loi khi goi:",
                        model
                    );


                    console.log(
                        error
                    );


                    lastError =
                        error.message;


                    if (attempt < 2)
                    {
                        await sleep(
                            1200
                        );
                    }
                }
            }
        }


        /*
         * TAT CA MODEL DEU LOI
         */

        console.log(
            "Tat ca Gemini model deu that bai"
        );


        return res.status(503).json({
            success: false,

            message:
                "MentalGuard AI đang bận. Bạn vui lòng thử lại sau một chút.",

            detail:
                lastError
        });
    }

    catch (error)
    {
        console.error(
            "AI CHAT ERROR:",
            error
        );


        res.status(500).json({
            success: false,

            message:
                "Không thể kết nối MentalGuard AI."
        });
    }
});


/* =========================
   SERVER STATUS
   ========================= */

app.get("/api/status", (req, res) => {

    res.json({
        success: true,
        server: "MentalGuard",
        group: "Nhom 4",
        status: "running",

        ai:
            "Gemini with automatic fallback",

        aiConfigured:
            Boolean(GEMINI_API_KEY),

        models:
            GEMINI_MODELS
    });
});


/* =========================
   START SERVER
   ========================= */

app.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log(
            "================================"
        );

        console.log(
            "MENTALGUARD - NHOM 4"
        );

        console.log(
            "================================"
        );

        console.log(
            "Server dang chay tai port:"
        );

        console.log(
            PORT
        );


        if (GEMINI_API_KEY)
        {
            console.log(
                "GEMINI AI: READY"
            );
        }

        else
        {
            console.log(
                "GEMINI AI: CHUA CO API KEY"
            );
        }


        console.log(
            ""
        );

        console.log(
            "Gemini fallback:"
        );


        for (const model of GEMINI_MODELS)
        {
            console.log(
                "-",
                model
            );
        }


        console.log(
            ""
        );

        console.log(
            "API:"
        );

        console.log(
            "POST /api/data"
        );

        console.log(
            "GET  /api/data/latest"
        );

        console.log(
            "POST /api/chat"
        );

        console.log(
            "GET  /api/status"
        );

        console.log(
            "================================"
        );
    }
);