import { NextRequest, NextResponse } from "next/server"

import { runImport } from "@/lib/importer/runImport"

export async function POST(
  request: NextRequest
) {
  try {

    const body = await request.json()

    const result = await runImport(body)

    return NextResponse.json({
      success: true,
      ...result,
    })

  } catch (error) {

    console.error(error)

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown error",
      },
      {
        status: 500,
      }
    )

  }
}