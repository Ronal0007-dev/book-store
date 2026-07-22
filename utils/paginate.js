const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50; // guardrail so a client can't request e.g. limit=100000 and hammer the DB

/**
 * Reads page/limit from a query object (works for both API req.query and
 * server-rendered web req.query) and returns Sequelize-ready { limit, offset }
 * plus the normalized page/limit for building response/pagination metadata.
 */
function getPagination(query = {}) {
  let page = parseInt(query.page, 10);
  let limit = parseInt(query.limit, 10);

  if (!Number.isInteger(page) || page < 1) page = 1;
  if (!Number.isInteger(limit) || limit < 1) limit = DEFAULT_LIMIT;
  if (limit > MAX_LIMIT) limit = MAX_LIMIT;

  return { page, limit, offset: (page - 1) * limit };
}

/**
 * Builds the standard pagination metadata block returned alongside paginated
 * list responses, given the page/limit used and the total row count from a
 * Sequelize findAndCountAll().
 */
function buildMeta({ page, limit }, totalItems) {
  const totalPages = Math.max(1, Math.ceil(totalItems / limit));
  return {
    page,
    limit,
    totalItems,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1
  };
}

module.exports = { getPagination, buildMeta, DEFAULT_LIMIT, MAX_LIMIT };
