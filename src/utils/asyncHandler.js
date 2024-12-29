const asyncHandler = (requestHadler) => {
  return (req, res, next) => {
    Promise.resolve(requestHadler(req, res, next)).catch((err) => next(err));
  };
};

export { asyncHandler };
