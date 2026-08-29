import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { GatewayAuthGuard } from '../../common/guards/gateway-auth.guard';
import { AgentRunnerService } from './agent-runner.service';
import { AgentToolsService } from './agent-tools.service';
import { RunToolDto, DecideActionDto } from './dto/agent.dto';

@ApiTags('Agent')
@ApiBearerAuth()
@UseGuards(GatewayAuthGuard)
@Controller('agent')
export class AgentController {
  constructor(
    private readonly runner: AgentRunnerService,
    private readonly tools: AgentToolsService,
  ) {}

  @Get('tools')
  @ApiOperation({ summary: 'List semua tool agentic + tingkat risikonya' })
  @ApiQuery({ name: 'role', required: false, example: 'CFO' })
  listTools(@Query('role') role?: string) {
    const defs = role ? this.tools.toolsForRole(role) : this.tools.allTools();
    return {
      autonomy: process.env.AGENT_AUTONOMY === 'full' ? 'full' : 'guarded',
      count: defs.length,
      data: defs.map((t) => ({
        name: t.name,
        risk: t.risk,
        description: t.description,
        parameters: Object.keys(t.parameters.properties),
        required: t.parameters.required ?? [],
      })),
    };
  }

  @Post('tools/:name/run')
  @ApiOperation({
    summary: 'Jalankan satu tool manual (debugging) — melewati AI, tetap kena guardrail approval',
  })
  @ApiParam({ name: 'name', example: 'get_platform_kpi' })
  runTool(@Param('name') name: string, @Body() dto: RunToolDto) {
    return this.tools.dispatch(
      { name, args: dto.args ?? {} },
      { origin: 'manual', executiveRole: dto.role_code },
    );
  }

  @Get('actions')
  @ApiOperation({ summary: 'Audit trail aksi agent (filter status opsional)' })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['pending_approval', 'executed', 'rejected', 'failed'],
  })
  @ApiQuery({ name: 'limit', required: false, example: 50 })
  listActions(@Query('status') status?: string, @Query('limit') limit?: string) {
    return this.runner.listActions(status, limit ? parseInt(limit, 10) : 50);
  }

  @Post('actions/:id/approve')
  @ApiOperation({ summary: 'Setujui aksi sensitif — tool baru dieksekusi setelah ini' })
  @ApiParam({ name: 'id', description: 'UUID agent action' })
  approve(@Param('id') id: string, @Body() dto: DecideActionDto) {
    return this.runner.approveAction(id, dto?.decided_by);
  }

  @Post('actions/:id/reject')
  @ApiOperation({ summary: 'Tolak aksi sensitif — tool tidak akan pernah dijalankan' })
  @ApiParam({ name: 'id', description: 'UUID agent action' })
  reject(@Param('id') id: string, @Body() dto: DecideActionDto) {
    return this.runner.rejectAction(id, dto?.decided_by);
  }
}
