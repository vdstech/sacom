export async function getCustomerMe(req, res) {
  const customer = req.customer;
  return res.json({
    customer: {
      id: customer._id,
      email: customer.email,
      name: customer.name,
      phone: customer.phone || "",
    },
  });
}
