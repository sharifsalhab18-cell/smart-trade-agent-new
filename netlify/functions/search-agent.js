exports.handler = async function (event) {

  // السماح بطلبات POST فقط
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        ok: false,
        message: "Method Not Allowed"
      })
    };
  }

  try {

    const data = JSON.parse(event.body || "{}");

    const product = String(data.product || "").trim();
    const maxPrice = Number(data.maxPrice || 0);
    const minProfit = Number(data.minProfit || 0);
    const region = String(data.region || "أوكرانيا").trim();

    if (!product || maxPrice <= 0 || minProfit <= 0) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          ok: false,
          message: "بيانات البحث غير مكتملة"
        })
      };
    }

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({

        ok: true,

        message: "تم استلام طلب البحث بنجاح",

        search: {
          product: product,
          maxPrice: maxPrice,
          minProfit: minProfit,
          region: region
        },

        status: "agent_connected",

        note: "تم الاتصال بالوكيل. البحث الخارجي سيتم ربطه في المرحلة التالية."

      })
    };

  } catch (error) {

    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        ok: false,
        message: "حدث خطأ في معالجة الطلب"
      })
    };
  }
};