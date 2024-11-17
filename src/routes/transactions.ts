import { randomUUID } from "node:crypto";
import { FastifyInstance } from "fastify";
import knex from "@/database";
import { z } from "zod";

export default async function (app: FastifyInstance) {
  app.get("/", async (request, reply) => {
    const sessionId = request.cookies.sessionId;

    if (!sessionId) {
      return reply.status(404).send({
        message: `👻 Not Found at ${request.url}(${request.method})`,
        cause: "There is no sessionId",
      });
    }

    return await knex("transactions").where("session_id", sessionId).select("id", "title", "type", "amount");
  });

  app.get("/summary", async () => {
    return await knex("transactions").sum("amount", { as: "amount" }).first();
  });

  app.get("/:id", async (request, reply) => {
    const getTransactionIdParamsSchema = z.object({
      id: z.string().uuid(),
    });

    const getTransactionIdParamsSchemaParsed =
      getTransactionIdParamsSchema.safeParse(request.params);

    if (!getTransactionIdParamsSchemaParsed.success) {
      return reply.status(400).send({
        message: `🚫 Bad Request at ${request.url}(${request.method})`,
        cause: getTransactionIdParamsSchemaParsed.error.issues,
      });
    }

    const { id } = request.params as { id: string };

    const transaction = await knex("transactions")
      .where("id", id)
      .first()
      .select("title", "type", "amount");

    if (!transaction) {
      return reply.status(404).send({
        message: `👻 Not Found at ${request.url}(${request.method})`,
        cause: `Transaction not found ${id}`,
      });
    }

    return reply.status(200).send(transaction);
  });

  app.post("/", async (request, reply) => {
    const createTransactionBodySchema = z.object({
      title: z.string(),
      amount: z.number(),
      type: z.enum(["credit", "debit"]),
    });

    if (!request.body) {
      return reply.status(400).send({
        message: `🚫 Bad Request at ${request.url}(${request.method})`,
        cause: "Body is Undefined",
      });
    }

    const { amount, title, type } = request.body as z.infer<
      typeof createTransactionBodySchema
    >;

    const createTransactionBodySchemaParsed =
      createTransactionBodySchema.safeParse({ amount, title, type });

    if (!createTransactionBodySchemaParsed.success) {
      return reply.status(400).send({
        message: `🚫 Bad Request at ${request.url}(${request.method})`,
        cause: createTransactionBodySchemaParsed.error.issues,
      });
    }

    const sessionId = request.cookies.sessionId || randomUUID();

    const transactionId = await knex("transactions")
      .insert({
        title,
        amount: type === "credit" ? amount : -amount,
        type,
        session_id: sessionId,
      })
      .returning("id");

    return reply
      .status(201)
      .cookie("sessionId", sessionId, {
        maxAge: 60 * 10,
      })
      .send(`✅ Transaction was been sucessful: ${transactionId[0].id}`);
  });
}
