import express from 'express'
import { getConfiguredModels, getDefaultModelSelection } from '../llm/modelCatalog'

export const modelsRouter = express.Router()

modelsRouter.get('/', (_req: express.Request, res: express.Response): void => {
  const models = getConfiguredModels()
  res.json({
    models,
    defaultSelection: getDefaultModelSelection(models) ?? null
  })
})
