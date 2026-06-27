async function run() {
  try {
    console.log("1. Logging in as admin on Vercel production...");
    const loginRes = await fetch("https://ggm-s-or-oder.vercel.app/api/auth/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "admin",
        password: "Admin@123456"
      })
    });

    if (!loginRes.ok) {
      console.error("Login failed:", loginRes.status, await loginRes.text());
      return;
    }

    const { token } = await loginRes.json() as any;
    console.log("Login success! Token:", token);

    console.log("2. Sending bulk notification targeting 'all' on Vercel production...");
    const sendRes = await fetch("https://ggm-s-or-oder.vercel.app/api/admin/send-notification-bulk", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({
        type: "offer",
        title: "Vercel Live Bulk Offer",
        message: "GGMS Grocery પર આજે ખાસ ઓફર ચાલુ છે. હમણાં ખરીદી કરો!",
        image: "",
        buttonText: "Shop Now",
        buttonLink: "/offers",
        target_type: "all"
      })
    });

    if (!sendRes.ok) {
      console.error("Send failed:", sendRes.status, await sendRes.text());
      return;
    }

    const result = await sendRes.json();
    console.log("Send result on production:", JSON.stringify(result, null, 2));

  } catch (error) {
    console.error("Error testing API on production:", error);
  }
}

run();
